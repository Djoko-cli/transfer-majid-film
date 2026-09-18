import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import * as archiver from "archiver";
import * as crypto from "crypto";
import { createReadStream } from "fs";
import * as fs from "fs/promises";
import * as mime from "mime-types";
import { I18nService } from "nestjs-i18n";
import { ConfigService } from "src/config/config.service";
import { PrismaService } from "src/prisma/prisma.service";
import { byteToHumanSizeString } from "src/utils/fileSize.util";
import { parseRangeHeader } from "src/utils/range.util";
import { getUserActiveStorageUsage } from "src/utils/storageQuota.util";
import { validate as isValidUUID } from "uuid";
import { QUARANTINE_DIRECTORY, SHARE_DIRECTORY } from "../constants";
import { Readable } from "stream";
import { ThumbnailService } from "./thumbnail.service";

@Injectable()
export class LocalFileService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private readonly i18n: I18nService,
    private thumbnailService: ThumbnailService,
  ) {}

  async create(
    data: string,
    chunk: { index: number; total: number },
    file: { id?: string; name: string },
    shareId: string,
  ) {
    if (!file.id) {
      file.id = crypto.randomUUID();
    } else if (!isValidUUID(file.id)) {
      throw new BadRequestException(this.i18n.t("file.invalidIdFormat"));
    }

    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: {
        files: true,
        reverseShare: { include: { creator: true } },
        creator: true,
      },
    });

    // A collection is the one transfer that is locked and still writable:
    // locked is what makes it readable, and it has to be readable while it
    // fills. What actually authorises this write is the open contribution
    // the controller checked before getting here — this flag only says the
    // transfer is not frozen.
    if (share.uploadLocked && !share.isCollection)
      throw new BadRequestException(this.i18n.t("file.alreadyCompleted"));

    let diskFileSize: number;
    try {
      diskFileSize = (
        await fs.stat(`${SHARE_DIRECTORY}/${shareId}/${file.id}.tmp-chunk`)
      ).size;
    } catch {
      diskFileSize = 0;
    }

    // If the sent chunk index and the expected chunk index doesn't match throw an error
    const chunkSize = this.config.get("share.chunkSize");
    const expectedChunkIndex = Math.ceil(diskFileSize / chunkSize);

    if (expectedChunkIndex != chunk.index)
      throw new BadRequestException({
        message: this.i18n.t("file.unexpectedChunk"),
        error: "unexpected_chunk_index",
        expectedChunkIndex,
      });

    const buffer = Buffer.from(data, "base64");

    // Check if there is enough space on the server
    const space = await fs.statfs(SHARE_DIRECTORY);
    const availableSpace = space.bavail * space.bsize;
    if (availableSpace < buffer.byteLength) {
      throw new InternalServerErrorException(
        this.i18n.t("file.notEnoughSpace"),
      );
    }

    // Check if share size limit is exceeded
    const fileSizeSum = share.files.reduce(
      (n, { size }) => n + parseInt(size),
      0,
    );

    const shareSizeSum = fileSizeSum + diskFileSize + buffer.byteLength;

    let limit = parseInt(this.config.get("share.maxSize"));
    if (share.reverseShare?.maxShareSize) {
      limit = parseInt(share.reverseShare.maxShareSize);
    } else if (share.creator?.shareSizeLimit) {
      limit = parseInt(share.creator.shareSizeLimit);
    }

    if (shareSizeSum > limit) {
      throw new HttpException(
        this.i18n.t("file.maxSizeExceeded"),
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }

    const quotaOwner = share.reverseShare
      ? share.reverseShare.creator
      : share.creator;
    const quotaOwnerId = share.reverseShare
      ? share.reverseShare.creatorId
      : share.creatorId;

    if (quotaOwnerId && quotaOwner?.storageQuotaLimit) {
      const quotaLimit = parseInt(quotaOwner.storageQuotaLimit);
      const activeStorageUsage = await getUserActiveStorageUsage(
        this.prisma,
        quotaOwnerId,
      );
      const projectedUsage =
        activeStorageUsage + diskFileSize + buffer.byteLength;

      if (projectedUsage > quotaLimit) {
        const exceededBytes = projectedUsage - quotaLimit;
        const exceededSize = byteToHumanSizeString(exceededBytes);
        throw new HttpException(
          share.reverseShare
            ? this.i18n.t("file.reverseShareQuotaExceeded", {
                args: { exceededSize },
              })
            : this.i18n.t("file.storageQuotaExceeded", {
                args: { exceededSize },
              }),
          HttpStatus.PAYLOAD_TOO_LARGE,
        );
      }
    }

    await fs.appendFile(
      `${SHARE_DIRECTORY}/${shareId}/${file.id}.tmp-chunk`,
      buffer,
    );

    const isLastChunk = chunk.index == chunk.total - 1;
    if (isLastChunk) {
      await fs.rename(
        `${SHARE_DIRECTORY}/${shareId}/${file.id}.tmp-chunk`,
        `${SHARE_DIRECTORY}/${shareId}/${file.id}`,
      );
      const fileSize = (
        await fs.stat(`${SHARE_DIRECTORY}/${shareId}/${file.id}`)
      ).size;
      await this.prisma.file.create({
        data: {
          id: file.id,
          name: file.name,
          size: fileSize.toString(),
          share: { connect: { id: shareId } },
        },
      });
      void this.thumbnailService.generate(shareId, file.id, file.name);
    }

    return file;
  }

  async get(shareId: string, fileId: string, rangeHeader?: string) {
    // Scoped by shareId *and* fileId together, not fileId alone — id is
    // globally unique so a bare findUnique({where:{id}}) would resolve any
    // share's file, relying only on the on-disk path (built from the URL's
    // own shareId) to accidentally 404 a cross-share request instead of
    // rejecting it as unauthorized at the query itself.
    const fileMetaData = await this.prisma.file.findFirst({
      where: { id: fileId, shareId },
    });

    if (!fileMetaData)
      throw new NotFoundException(this.i18n.t("file.notFound"));

    const rangeRequestsEnabled = this.config.get(
      "share.enableVideoRangeRequests",
    );
    const range = rangeRequestsEnabled
      ? parseRangeHeader(rangeHeader, parseInt(fileMetaData.size))
      : null;

    // Confirmed openable *before* returning, same pattern as getZip()
    // below — FileController.getFile() sets response headers (status,
    // Content-Length) right after this call returns, so any failure has
    // to surface here to become a clean 404 instead of a broken/truncated
    // download after headers are already committed. This used to be a
    // exotic case (someone hand-deleting an uploaded file); a NAS-import
    // file is a symlink to something outside the app's control, so its
    // target going missing (moved, renamed, deleted on the NAS side) is a
    // routine possibility now, not just a theoretical one.
    const file = await new Promise<ReturnType<typeof createReadStream>>(
      (resolve, reject) => {
        const stream = createReadStream(
          `${SHARE_DIRECTORY}/${shareId}/${fileId}`,
          range ? { start: range.start, end: range.end } : undefined,
        );
        stream.on("open", () => resolve(stream));
        stream.on("error", () =>
          reject(new NotFoundException(this.i18n.t("file.notFound"))),
        );
      },
    );

    return {
      metaData: {
        mimeType: mime.contentType(fileMetaData.name.split(".").pop()),
        ...fileMetaData,
        size: fileMetaData.size,
      },
      file,
      range,
      rangeRequestsEnabled,
    };
  }

  // Mirrors get() above: 404s unless the row is actually "ready" (covers
  // "pending"/"failed"/"unsupported"/null alike — none of those have a
  // .thumb.jpg on disk to stream), then confirms the file is openable
  // before returning, same reasoning as get()'s own comment.
  async getThumbnail(shareId: string, fileId: string) {
    // Same shareId+fileId scoping as get() above, for the same reason.
    const fileMetaData = await this.prisma.file.findFirst({
      where: { id: fileId, shareId },
    });

    if (!fileMetaData || fileMetaData.thumbnailStatus !== "ready")
      throw new NotFoundException(this.i18n.t("file.notFound"));

    const file = await new Promise<ReturnType<typeof createReadStream>>(
      (resolve, reject) => {
        const stream = createReadStream(
          `${SHARE_DIRECTORY}/${shareId}/${fileId}.thumb.jpg`,
        );
        stream.on("open", () => resolve(stream));
        stream.on("error", () =>
          reject(new NotFoundException(this.i18n.t("file.notFound"))),
        );
      },
    );

    return { file };
  }

  async remove(shareId: string, fileId: string) {
    const fileMetaData = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!fileMetaData)
      throw new NotFoundException(this.i18n.t("file.notFound"));

    await fs.unlink(`${SHARE_DIRECTORY}/${shareId}/${fileId}`);
    // Best-effort — most files never had a thumbnail generated at all
    // (non-video, or generation still pending/failed), so ENOENT here is
    // the common case, not an error.
    await fs
      .unlink(`${SHARE_DIRECTORY}/${shareId}/${fileId}.thumb.jpg`)
      .catch(() => {});

    await this.prisma.file.delete({ where: { id: fileId } });
  }

  async deleteAllFiles(shareId: string) {
    await fs.rm(`${SHARE_DIRECTORY}/${shareId}`, {
      recursive: true,
      force: true,
    });
  }

  // Moves rather than deletes — used instead of deleteAllFiles when
  // clamav.infectedFileAction is "quarantine", so an admin can inspect a
  // flagged share (a false positive, or confirm a real one) before it's
  // gone for good. fs.rename is a same-filesystem, effectively-instant,
  // atomic move regardless of the share's size — and, for a NAS-imported
  // share whose "files" are symlinks (see NasImportService), it moves
  // the symlink *entry* itself without ever dereferencing it, so the
  // real file on the NAS this app never copied in the first place stays
  // completely untouched either way. Falls back to copy+delete only if
  // QUARANTINE_DIRECTORY is ever reconfigured onto a different
  // filesystem than SHARE_DIRECTORY, which rename() can't cross.
  async quarantineAllFiles(shareId: string) {
    await fs.mkdir(QUARANTINE_DIRECTORY, { recursive: true });
    const source = `${SHARE_DIRECTORY}/${shareId}`;
    const destination = `${QUARANTINE_DIRECTORY}/${shareId}`;

    try {
      await fs.rename(source, destination);
    } catch (err: any) {
      if (err?.code !== "EXDEV") throw err;
      await fs.cp(source, destination, {
        recursive: true,
        verbatimSymlinks: true,
      });
      await fs.rm(source, { recursive: true, force: true });
    }
  }

  async getZip(shareId: string): Promise<Readable> {
    return new Promise((resolve, reject) => {
      const zipStream = createReadStream(
        `${SHARE_DIRECTORY}/${shareId}/archive.zip`,
      );

      zipStream.on("error", (err) => {
        reject(new InternalServerErrorException(err));
      });

      zipStream.on("open", () => {
        resolve(zipStream);
      });
    });
  }

  // Live counterpart of getZip() above, for a share with NAS-imported
  // files — see ShareService.complete()'s own comment on why those never
  // get a cached archive.zip: generating one would read every symlinked
  // file and write a real, second copy of the whole thing to local disk,
  // exactly what importing instead of uploading was meant to avoid. This
  // builds the same archiver instance createZip() does (same compression
  // setting, same file list, same per-entry names) but never touches disk
  // itself: the caller (FileController.getZip(), via StreamableFile) pipes
  // the returned stream straight to the HTTP response, and archiver
  // compresses each entry on demand as that consumer reads.
  //
  // finalize() is called here, not awaited by the caller, deliberately —
  // it resolves once every appended entry has been fully read and queued
  // into archiver's own internal buffer, not once a consumer has drained
  // that buffer to the client. Awaiting it before anything pipes the
  // stream would mean waiting on a promise nothing is around to unblock
  // for a share of any real size, since finalize() and stream consumption
  // are two independent processes that both need to run concurrently —
  // the same reason ShareService.createZip() pipes to its write stream
  // *before* awaiting finalize(), not after.
  async streamZip(shareId: string): Promise<archiver.Archiver> {
    const files = await this.prisma.file.findMany({ where: { shareId } });
    const archive = archiver("zip", {
      zlib: { level: this.config.get("share.zipCompressionLevel") },
    });

    for (const file of files) {
      archive.append(
        createReadStream(`${SHARE_DIRECTORY}/${shareId}/${file.id}`),
        { name: file.name },
      );
    }

    void archive.finalize();
    return archive;
  }
}
