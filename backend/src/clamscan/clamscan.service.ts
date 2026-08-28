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
  }> {
    const enabled = this.config.get("clamav.enabled");
    const clamScan = await this.getClamScan();

    if (!clamScan) return { enabled, connected: false, version: null };

    try {
      const version = await clamScan.getVersion();
      return { enabled, connected: true, version };
    } catch {
      return { enabled, connected: true, version: null };
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

  private async logScan(entry: {
    shareId?: string;
    shareName?: string;
    status: ScanStatus;
    fileCount?: number;
    infectedCount?: number;
    infectedFileNames?: string;
    errorMessage?: string;
  }) {
    try {
      await this.prisma.clamavScan.create({
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
    } catch (err: any) {
      this.logger.error(
        `Failed to write ClamAV scan log: ${err?.message || "unknown error"}`,
      );
    }
  }

  async check(shareId: string) {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      select: { storageProvider: true, name: true },
    });

    if (!this.config.get("clamav.enabled")) return [];

    const clamScan = await this.getClamScan();

    if (!clamScan) {
      await this.logScan({
        shareId,
        shareName: share?.name,
        status: "error",
        errorMessage: "ClamAV is enabled but unreachable",
      });
      return [];
    }

    const storageProvider = share?.storageProvider || "LOCAL";
    const infectedFiles: { id: string; name: string }[] = [];
    let fileCount = 0;
    let scanError: string | undefined;

    if (storageProvider === "S3") {
      const files = await this.prisma.file.findMany({
        where: { shareId },
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
      try {
        files = fs
          .readdirSync(`${SHARE_DIRECTORY}/${shareId}`)
          .filter((file) => file != "archive.zip");
      } catch (e) {
        void e;
        return [];
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

    await this.logScan({
      shareId,
      shareName: share?.name,
      status: infectedFiles.length > 0 ? "infected" : "clean",
      fileCount,
      infectedCount: infectedFiles.length,
      infectedFileNames:
        infectedFiles.map((file) => file.name).join(", ") || undefined,
      errorMessage: scanError,
    });

    return infectedFiles;
  }

  async checkAndRemove(shareId: string) {
    try {
      const infectedFiles = await this.check(shareId);

      if (infectedFiles.length > 0) {
        try {
          await this.fileService.deleteAllFiles(shareId);
          await this.prisma.file.deleteMany({ where: { shareId } });
        } catch (err: any) {
          this.logger.error(
            `Failed to delete malicious share ${shareId}: ${err?.message || "unknown error"}`,
          );
          return;
        }

        const fileNames = infectedFiles.map((file) => file.name).join(", ");

        await this.prisma.share.update({
          where: { id: shareId },
          data: {
            removedReason: `Your share got removed because the file(s) ${fileNames} are malicious.`,
          },
        });

        this.logger.warn(
          `Share ${shareId} deleted because it contained ${infectedFiles.length} malicious file(s)`,
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Error during ClamAV scan for share ${shareId}: ${err?.message || "unknown error"}`,
      );
    }
  }
}
