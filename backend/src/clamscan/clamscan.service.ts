import { Injectable, Logger } from "@nestjs/common";
import * as NodeClam from "clamscan";
import * as fs from "fs";
import { Readable } from "stream";
import { ConfigService } from "src/config/config.service";
import { FileService } from "src/file/file.service";
import { PrismaService } from "src/prisma/prisma.service";
import { CLAMAV_HOST, CLAMAV_PORT, SHARE_DIRECTORY } from "../constants";

const clamscanConfig = {
  clamdscan: {
    host: CLAMAV_HOST,
    port: CLAMAV_PORT,
    localFallback: false,
  },
  preference: "clamdscan",
};

type ScanStatus = "clean" | "infected" | "error";

type DatabaseInfo = { revision: number; builtAt: string } | null;

// clamd's VERSION command replies with a single line shaped like
// "ClamAV 1.3.1/27234/Fri Aug 29 08:14:00 2026" — engine version, then
// the signature database's own revision number, then when that revision
// was built. Parsed out here so the admin panel can show *when the
// virus definitions were last updated* rather than just this opaque
// string — the actual thing an admin checking "is ClamAV working"
// wants to know, since a stale database (freshclam silently failing,
// e.g. a NAS firewall blocking its update mirrors) still reports
// `connected: true` above; a scan still runs, just against
// signatures a scan a week or a month ago would have caught. Returns
// nulls rather than throwing on an unexpected format — a parse miss
// should never take down the status endpoint, only fall back to
// showing the raw string.
const parseClamdVersion = (
  raw: string,
): { engineVersion: string | null; database: DatabaseInfo } => {
  const match = raw.trim().match(/^ClamAV\s+(\S+)\/(\d+)\/(.+)$/);
  if (!match) return { engineVersion: null, database: null };

  const [, engineVersion, revision, builtAtRaw] = match;
  const builtAt = new Date(builtAtRaw.trim());
  if (isNaN(builtAt.getTime())) {
    return { engineVersion, database: null };
  }

  return {
    engineVersion,
    database: {
      revision: parseInt(revision, 10),
      builtAt: builtAt.toISOString(),
    },
  };
};

@Injectable()
export class ClamScanService {
  private readonly logger = new Logger(ClamScanService.name);

  constructor(
    private fileService: FileService,
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private clamScanInstance: NodeClam | null = null;

  private async getClamScan(): Promise<NodeClam | null> {
    if (this.clamScanInstance) {
      return this.clamScanInstance;
    }

    try {
      const instance = await new NodeClam().init(clamscanConfig);
      this.logger.log("ClamAV is active and connected");
      this.clamScanInstance = instance;
      return instance;
    } catch (_) {
      this.logger.log("ClamAV is not active or unreachable");
      return null;
    }
  }

  // Independent of the `clamav.enabled` config toggle on purpose — this is
  // "is clamd actually reachable right now", which an admin wants to know
  // whether scanning is currently on or off (e.g. to verify connectivity
  // before flipping it back on).
  async getStatus(): Promise<{
    enabled: boolean;
    connected: boolean;
    version: string | null;
    engineVersion: string | null;
    database: DatabaseInfo;
  }> {
    const enabled = this.config.get("clamav.enabled");
    const clamScan = await this.getClamScan();

    if (!clamScan)
      return {
        enabled,
        connected: false,
        version: null,
        engineVersion: null,
        database: null,
      };

    try {
      const version = await clamScan.getVersion();
      const { engineVersion, database } = parseClamdVersion(version);
      return { enabled, connected: true, version, engineVersion, database };
    } catch {
      return {
        enabled,
        connected: true,
        version: null,
        engineVersion: null,
        database: null,
      };
    }
  }

  async listScans(take = 20, skip = 0) {
    const [scans, total] = await Promise.all([
      this.prisma.clamavScan.findMany({
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
      this.prisma.clamavScan.count(),
    ]);
    return { scans, total };
  }

  // Returns the created row's id (or null on write failure) so
  // checkAndRemove can record which action was actually taken
  // (deleted/quarantined) once it's known — that only happens *after*
  // this log entry already exists, since it depends on check()'s own
  // result.
  private async logScan(entry: {
    shareId?: string;
    shareName?: string;
    status: ScanStatus;
    fileCount?: number;
    infectedCount?: number;
    infectedFileNames?: string;
    errorMessage?: string;
  }): Promise<string | null> {
    try {
      const scan = await this.prisma.clamavScan.create({
        data: {
          shareId: entry.shareId,
          shareName: entry.shareName,
          status: entry.status,
          fileCount: entry.fileCount ?? 0,
          infectedCount: entry.infectedCount ?? 0,
          infectedFileNames: entry.infectedFileNames,
          errorMessage: entry.errorMessage,
        },
      });
      return scan.id;
    } catch (err: any) {
      this.logger.error(
        `Failed to write ClamAV scan log: ${err?.message || "unknown error"}`,
      );
      return null;
    }
  }

  // scanId lets checkAndRemove attach which action it ended up taking
  // (delete/quarantine) to the exact log row this call created, once
  // that's decided — see logScan's own comment. null when disabled, or
  // when there was nothing to attach it to in the first place (no share
  // directory, or the log write itself failed).
  //
  // contributionId narrows the scan to one deposit of a collection's
  // container. Everything else about the call is unchanged — same log
  // row, same statuses — only the set of files looked at is smaller.
  async check(
    shareId: string,
    contributionId?: string,
  ): Promise<{
    infectedFiles: { id: string; name: string }[];
    scanId: string | null;
  }> {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      select: { storageProvider: true, name: true },
    });

    if (!this.config.get("clamav.enabled"))
      return { infectedFiles: [], scanId: null };

    const clamScan = await this.getClamScan();

    if (!clamScan) {
      const scanId = await this.logScan({
        shareId,
        shareName: share?.name,
        status: "error",
        errorMessage: "ClamAV is enabled but unreachable",
      });
      return { infectedFiles: [], scanId };
    }

    const storageProvider = share?.storageProvider || "LOCAL";
    const infectedFiles: { id: string; name: string }[] = [];
    let fileCount = 0;
    let scanError: string | undefined;

    if (storageProvider === "S3") {
      const files = await this.prisma.file.findMany({
        where: { shareId, ...(contributionId ? { contributionId } : {}) },
        select: { id: true, name: true },
      });
      fileCount = files.length;

      for (const f of files) {
        try {
          const fileObj = await this.fileService.get(shareId, f.id);
          const result = await clamScan.scanStream(fileObj.file as Readable);
          const isInfected = !!result?.isInfected;

          if (isInfected) infectedFiles.push({ id: f.id, name: f.name });
        } catch (err: any) {
          scanError = err?.message || "unknown error";
          this.logger.warn(
            `ClamAV scan failed for S3 file ${f.name} (${f.id}) in share ${shareId}: ${scanError}`,
          );
        }
      }

      this.logger.log(
        `ClamAV scan completed for S3 share ${shareId}: ${infectedFiles.length} infected file(s) found`,
      );
    } else {
      // Local Storage Provider
      let files: string[] = [];
      if (contributionId) {
        // Scoped to one deposit, so the ids come from the File rows that
        // carry the contribution — a directory listing knows nothing
        // about who wrote what, and for a collection's container it lists
        // everybody's files at once.
        files = (
          await this.prisma.file.findMany({
            where: { shareId, contributionId },
            select: { id: true },
          })
        ).map((file) => file.id);
      } else {
        try {
          files = fs
            .readdirSync(`${SHARE_DIRECTORY}/${shareId}`)
            .filter(
              (file) => file != "archive.zip" && !file.endsWith(".thumb.jpg"),
            );
        } catch (e) {
          void e;
          return { infectedFiles: [], scanId: null };
        }
      }
      fileCount = files.length;

      for (const fileId of files) {
        try {
          const filePath = `${SHARE_DIRECTORY}/${shareId}/${fileId}`;
          const readStream = fs.createReadStream(filePath);
          const result = await clamScan.scanStream(readStream);
          const isInfected = !!result?.isInfected;

          const fileName =
            (await this.prisma.file.findUnique({ where: { id: fileId } }))
              ?.name || fileId;

          if (isInfected) {
            infectedFiles.push({ id: fileId, name: fileName });
          }
        } catch (err: any) {
          scanError = err?.message || "unknown error";
          this.logger.warn(
            `ClamAV scan failed for local file ${fileId} in share ${shareId}: ${scanError}`,
          );
        }
      }

      this.logger.log(
        `ClamAV scan completed for local share ${shareId}: ${infectedFiles.length} infected file(s) found`,
      );
    }

    const scanId = await this.logScan({
      shareId,
      shareName: share?.name,
      status: infectedFiles.length > 0 ? "infected" : "clean",
      fileCount,
      infectedCount: infectedFiles.length,
      infectedFileNames:
        infectedFiles.map((file) => file.name).join(", ") || undefined,
      errorMessage: scanError,
    });

    return { infectedFiles, scanId };
  }

  // contributionId present: this is one deposit into a collection's
  // container, not a whole transfer. The scan, the configured action and
  // the log row are all the same — only the blast radius narrows, and it
  // has to: the container belongs to every contributor at once, so
  // wiping it (or stamping removedReason on it, which 404s it for
  // everyone) because one deposit was infected would punish the transfer for
  // one person's file. Everything else the ordinary path does, a
  // contribution gets too.
  async checkAndRemove(shareId: string, contributionId?: string) {
    try {
      const { infectedFiles, scanId } = await this.check(
        shareId,
        contributionId,
      );

      if (infectedFiles.length > 0) {
        // "delete" if unset, matching this method's own behavior before
        // the config existed — an admin who never visits this setting
        // keeps getting exactly what they already had.
        const action = this.config.get("clamav.infectedFileAction") || "delete";

        if (action === "none") {
          // Detect-only: the share and its files are left exactly as
          // uploaded — no delete, no quarantine, no removedReason. Still
          // recorded on the scan row and logged, same as the other two
          // actions, so an admin who chose this still sees every
          // detection in both the scan history and the server log; they
          // just haven't asked the app to act on it automatically.
          if (scanId) {
            await this.prisma.clamavScan
              .update({ where: { id: scanId }, data: { action } })
              .catch(() => {
                // Non-critical — see the same catch a few lines below.
              });
          }
          this.logger.warn(
            `Share ${shareId} contains ${infectedFiles.length} malicious file(s) (${infectedFiles.map((file) => file.name).join(", ")}) — left as-is, clamav.infectedFileAction is "none"`,
          );
          return;
        }

        try {
          if (contributionId) {
            const fileIds = (
              await this.prisma.file.findMany({
                where: { shareId, contributionId },
                select: { id: true },
              })
            ).map((file) => file.id);

            if (action === "quarantine") {
              await this.fileService.quarantineFiles(shareId, fileIds);
            } else {
              await this.fileService.deleteFiles(shareId, fileIds);
            }
            await this.prisma.file.deleteMany({
              where: { id: { in: fileIds } },
            });
          } else {
            if (action === "quarantine") {
              await this.fileService.quarantineAllFiles(shareId);
            } else {
              await this.fileService.deleteAllFiles(shareId);
            }
            await this.prisma.file.deleteMany({ where: { shareId } });
          }
        } catch (err: any) {
          this.logger.error(
            `Failed to ${action} malicious ${contributionId ? `contribution ${contributionId} of share ${shareId}` : `share ${shareId}`}: ${err?.message || "unknown error"}`,
          );
          return;
        }

        const fileNames = infectedFiles.map((file) => file.name).join(", ");

        // Never for a contribution: removedReason is what makes
        // ShareService.get() answer "not found" to everyone, and the
        // container is the transfer every other contributor reads.
        if (!contributionId) {
          await this.prisma.share.update({
            where: { id: shareId },
            data: {
              removedReason: `Your share got removed because the file(s) ${fileNames} are malicious.`,
            },
          });
        }

        if (scanId) {
          await this.prisma.clamavScan
            .update({ where: { id: scanId }, data: { action } })
            .catch(() => {
              // Non-critical — the share itself is already handled
              // correctly above either way; this only affects what the
              // admin's scan history table displays for this row.
            });
        }

        this.logger.warn(
          `${contributionId ? `Contribution ${contributionId} of share ${shareId}` : `Share ${shareId}`} ${action === "quarantine" ? "quarantined" : "deleted"} because it contained ${infectedFiles.length} malicious file(s)`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Error during ClamAV scan for share ${shareId}: ${err?.message || "unknown error"}`,
      );
    }
  }
}
