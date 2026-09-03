import { Injectable, Logger } from "@nestjs/common";
import { execFile } from "child_process";
import * as fs from "fs/promises";
import * as mime from "mime-types";
import { promisify } from "util";
import { ConfigService } from "src/config/config.service";
import { PrismaService } from "src/prisma/prisma.service";
import { SHARE_DIRECTORY } from "../constants";

const execFileAsync = promisify(execFile);

// ffmpeg can hang far longer than this on a truly huge/broken source —
// this caps how long one generate() call can occupy an event-loop slot
// before ffmpeg gets killed and the call rejects instead.
const FFMPEG_TIMEOUT_MS = 20_000;

// NasImportService.importBatch() fires generate() once per file in a batch
// of up to IMPORT_BATCH_SIZE (300) with no await between calls — without a
// shared cap here, one large NAS import would spawn up to 300 concurrent
// ffmpeg child processes. Every generate() call, from either hook site,
// queues on this same gate, so the limit holds app-wide, not per-caller.
const MAX_CONCURRENT_THUMBNAILS = 4;

@Injectable()
export class ThumbnailService {
  private readonly logger = new Logger(ThumbnailService.name);
  private activeCount = 0;
  private readonly queue: (() => void)[] = [];

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private acquireSlot(): Promise<void> {
    if (this.activeCount < MAX_CONCURRENT_THUMBNAILS) {
      this.activeCount++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.queue.push(resolve));
  }

  // Hands the freed slot straight to the next waiter rather than
  // decrementing then letting them race to acquire it — keeps activeCount
  // accurate without a separate lock around the increment/decrement.
  private releaseSlot(): void {
    const next = this.queue.shift();
    if (next) next();
    else this.activeCount--;
  }

  // Fire-and-forget from LocalFileService.create() and
  // NasImportService.importBatch() (`void this.thumbnailService.generate(...)`)
  // — must never throw or leave an unhandled rejection, so everything past
  // the initial guards is wrapped.
  async generate(shareId: string, fileId: string, fileName: string) {
    try {
      if (!this.config.get("share.enableVideoThumbnails")) return;

      const mimeType = (mime.contentType(fileName) || "").split(";")[0];
      if (!mimeType.startsWith("video/")) return;

      await this.prisma.file.update({
        where: { id: fileId },
        data: { thumbnailStatus: "pending" },
      });

      const input = `${SHARE_DIRECTORY}/${shareId}/${fileId}`;
      const output = `${SHARE_DIRECTORY}/${shareId}/${fileId}.thumb.jpg`;

      await this.acquireSlot();
      let status: "ready" | "failed" | "unsupported";
      try {
        status = await this.extractFrame(input, output);
      } finally {
        this.releaseSlot();
      }

      await this.prisma.file.update({
        where: { id: fileId },
        data: { thumbnailStatus: status },
      });
    } catch (e: any) {
      this.logger.warn(
        `Thumbnail generation failed for file ${fileId} in share ${shareId}: ${e?.message || e}`,
      );
    }
  }

  // -ss before -i is what makes this a fast keyframe seek instead of a
  // full decode from frame 0 — essential given multi-GB source files. A
  // sub-1-second clip has no frame at 1s, so a failed first attempt is
  // retried once at -ss 0 before giving up. Never throws — the caller
  // always has *some* status to persist.
  private async extractFrame(
    input: string,
    output: string,
  ): Promise<"ready" | "failed" | "unsupported"> {
    try {
      await this.runFfmpeg("1", input, output);
      return "ready";
    } catch (firstErr: any) {
      // ffmpeg itself isn't installed on this system — a second attempt
      // would fail identically, so don't bother retrying.
      if (firstErr?.code === "ENOENT") {
        await fs.unlink(output).catch(() => {});
        return "unsupported";
      }

      try {
        await this.runFfmpeg("0", input, output);
        return "ready";
      } catch {
        // Best-effort cleanup of whatever partial file ffmpeg left behind
        // (a bad/corrupt source, a broken NAS-import symlink, an
        // unsupported codec) — ignore errors, there may be nothing there.
        await fs.unlink(output).catch(() => {});
        return "failed";
      }
    }
  }

  private async runFfmpeg(seek: string, input: string, output: string) {
    // execFile with an args array, never exec/shell — fileName/paths must
    // never touch a shell.
    await execFileAsync(
      "ffmpeg",
      [
        "-ss",
        seek,
        "-i",
        input,
        "-frames:v",
        "1",
        "-q:v",
        "4",
        "-vf",
        "scale=320:-2",
        "-y",
        output,
      ],
      { timeout: FFMPEG_TIMEOUT_MS },
    );
  }
}
