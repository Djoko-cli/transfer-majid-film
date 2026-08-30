import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "src/config/config.service";
import { PrismaService } from "src/prisma/prisma.service";
import { NAS_IMPORT_ROOT, SHARE_DIRECTORY } from "src/constants";

// Synology (and general junk) entries that should never show up in a
// listing or get pulled into an import — @eaDir is DSM's own auto-generated
// thumbnail cache, created in *every* folder on a DSM volume.
const IGNORED_ENTRY_NAMES = new Set(["@eaDir", "#recycle", "@tmp"]);

// Batch size for importBatch below — bounded so one request never holds
// the app's single SQLite connection (see docker-compose.yml's
// connection_limit=1) for longer than it takes to symlink+insert a few
// hundred files, regardless of how large the overall selection is.
const IMPORT_BATCH_SIZE = 300;

export type NasEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number | null;
};

type WalkedFile = {
  absPath: string;
  // Path relative to the *selected* top-level entry, using "/" as the
  // separator regardless of host OS — this becomes File.name, exactly
  // like the existing webkitRelativePath folder-upload convention
  // (Dropzone.tsx/file.util.ts), so a NAS-imported folder zips/displays
  // with the same nested structure a real folder upload would produce.
  relativeName: string;
  size: number;
};

@Injectable()
export class NasImportService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  private ensureEnabled() {
    if (!NAS_IMPORT_ROOT || !this.config.get("share.enableNasImport"))
      throw new ServiceUnavailableException(
        this.i18n.t("nasImport.notConfigured"),
      );
    // A symlink into SHARE_DIRECTORY only means anything on local disk —
    // ShareService.create()'s storageProvider always follows s3.enabled,
    // so an S3-backed share here would have every existing S3 code path
    // (download, zip, ClamAV) try to fetch these files from the S3 bucket
    // instead of the filesystem, and fail. Blocked outright rather than
    // silently producing broken shares.
    if (this.config.get("s3.enabled"))
      throw new ServiceUnavailableException(
        this.i18n.t("nasImport.incompatibleWithS3"),
      );
  }

  // Two-stage: a syntactic check against the *requested* path (cheap,
  // catches a plain "../" before ever touching the filesystem), then a
  // real fs.realpath resolution checked again — this second stage is the
  // one that actually matters, since it also catches a symlink *inside*
  // the mounted tree that points outside it (plausible on a years-old
  // archive), which the first stage can't see at all. Always compared
  // against `root + path.sep`, never a bare startsWith(root) — that would
  // also incorrectly match a sibling directory sharing the same prefix.
  private async resolveSafePath(relativePath: string): Promise<string> {
    let root: string;
    try {
      root = await fs.realpath(NAS_IMPORT_ROOT);
    } catch {
      throw new ServiceUnavailableException(
        this.i18n.t("nasImport.notConfigured"),
      );
    }

    const candidate = path.resolve(root, relativePath || ".");
    if (candidate !== root && !candidate.startsWith(root + path.sep))
      throw new ForbiddenException(this.i18n.t("nasImport.pathEscapesRoot"));

    let real: string;
    try {
      real = await fs.realpath(candidate);
    } catch {
      throw new NotFoundException(this.i18n.t("nasImport.pathNotFound"));
    }

    if (real !== root && !real.startsWith(root + path.sep))
      throw new ForbiddenException(this.i18n.t("nasImport.pathEscapesRoot"));

    return real;
  }

  private isImportable(name: string): boolean {
    return !name.startsWith(".") && !IGNORED_ENTRY_NAMES.has(name);
  }

  // One directory level, for the browse UI.
  async browse(relativePath: string): Promise<NasEntry[]> {
    this.ensureEnabled();
    const root = await fs.realpath(NAS_IMPORT_ROOT);
    const real = await this.resolveSafePath(relativePath);

    const dirents = await fs.readdir(real, { withFileTypes: true });
    const results: NasEntry[] = [];

    for (const entry of dirents) {
      if (!this.isImportable(entry.name)) continue;

      const entryPath = path.join(real, entry.name);
      if (entry.isDirectory()) {
        results.push({
          name: entry.name,
          path: path.relative(root, entryPath),
          isDirectory: true,
          size: null,
        });
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(entryPath);
          results.push({
            name: entry.name,
            path: path.relative(root, entryPath),
            isDirectory: false,
            size: stat.size,
          });
        } catch {
          continue; // vanished between readdir and stat — just skip it
        }
      }
      // anything else (socket, device, ...) is silently skipped
    }

    results.sort((a, b) =>
      a.isDirectory !== b.isDirectory
        ? a.isDirectory
          ? -1
          : 1
        : a.name.localeCompare(b.name),
    );
    return results;
  }

  // Recursively yields every real file under each selected path, re-
  // validating every symlink hop against the root as it descends (not
  // just the top-level selection) — a directory *inside* the tree could
  // itself be a symlink pointing outside it.
  private async *walk(
    relativePaths: string[],
  ): AsyncGenerator<WalkedFile> {
    const root = await fs.realpath(NAS_IMPORT_ROOT);
    for (const relativePath of relativePaths) {
      const real = await this.resolveSafePath(relativePath);
      yield* this.walkOne(real, path.basename(real), root);
    }
  }

  private async *walkOne(
    absPath: string,
    relativeName: string,
    root: string,
  ): AsyncGenerator<WalkedFile> {
    let stat;
    try {
      stat = await fs.stat(absPath);
    } catch {
      return; // broken symlink or vanished mid-walk — skip it
    }

    if (stat.isFile()) {
      yield { absPath, relativeName, size: stat.size };
      return;
    }
    if (!stat.isDirectory()) return;

    let entries;
    try {
      entries = await fs.readdir(absPath, { withFileTypes: true });
    } catch {
      return;
    }

    const sorted = entries
      .filter((e) => this.isImportable(e.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of sorted) {
      const childAbs = path.join(absPath, entry.name);
      let childReal: string;
      try {
        childReal = await fs.realpath(childAbs);
      } catch {
        continue;
      }
      if (childReal !== root && !childReal.startsWith(root + path.sep))
        continue; // symlink escape mid-tree — skip rather than throw
      yield* this.walkOne(childReal, `${relativeName}/${entry.name}`, root);
    }
  }

  // Read-only — never touches the DB, so it's safe to call against an
  // arbitrarily large selection without the SQLite-contention concern
  // that shapes importBatch below.
  async preview(relativePaths: string[]) {
    this.ensureEnabled();
    let fileCount = 0;
    let totalSize = 0;
    for await (const file of this.walk(relativePaths)) {
      fileCount++;
      totalSize += file.size;
    }
    return { fileCount, totalSize };
  }

  // One page of the import: symlinks + a single createMany for up to
  // IMPORT_BATCH_SIZE files, resuming from `cursor`. Re-walks from the
  // start every call and skips up to `cursor` — simpler than persisting
  // walk state, and readdir/stat are cheap local-disk calls even repeated
  // across a few hundred pages, which is the realistic ceiling for a
  // personal NAS archive.
  async importBatch(shareId: string, relativePaths: string[], cursor = 0) {
    this.ensureEnabled();

    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: { files: true },
    });
    if (!share) throw new NotFoundException(this.i18n.t("share.notFound"));

    const existingNames = new Set(share.files.map((f) => f.name));
    const batch: { id: string; name: string; size: string; shareId: string }[] =
      [];
    const skippedCollisions: string[] = [];
    let index = -1;
    let nextCursor: number | null = null;

    for await (const file of this.walk(relativePaths)) {
      index++;
      if (index < cursor) continue;

      if (batch.length >= IMPORT_BATCH_SIZE) {
        nextCursor = index;
        break;
      }

      if (existingNames.has(file.relativeName)) {
        skippedCollisions.push(file.relativeName);
        continue;
      }

      const id = crypto.randomUUID();
      await fs.symlink(file.absPath, `${SHARE_DIRECTORY}/${shareId}/${id}`);
      batch.push({
        id,
        name: file.relativeName,
        size: String(file.size),
        shareId,
      });
      existingNames.add(file.relativeName);
    }

    if (batch.length > 0) {
      await this.prisma.file.createMany({ data: batch });
      if (!share.hasNasImportedFiles) {
        await this.prisma.share.update({
          where: { id: shareId },
          data: { hasNasImportedFiles: true },
        });
      }
    }

    return {
      importedThisBatch: batch.length,
      skippedCollisions,
      cursor: nextCursor,
      done: nextCursor === null,
    };
  }
}
