import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import * as contentDisposition from "content-disposition";
import { Request, Response } from "express";
import { CreateShareGuard } from "src/share/guard/createShare.guard";
import { StrictShareOwnerGuard } from "src/share/guard/strictShareOwner.guard";
import { IdValidation } from "src/share/guard/shareIdValidation.guard";
import { FileService } from "./file.service";
import { FileSecurityGuard } from "./guard/fileSecurity.guard";
import * as mime from "mime-types";

const VALID_ID_REGEX = /^[a-zA-Z0-9-]*={0,2}$/;

function getValidRecipientId(recipientId?: string): string | undefined {
  if (!recipientId) return undefined;
  return VALID_ID_REGEX.test(recipientId) ? recipientId : undefined;
}

@Controller("shares/:shareId/files")
export class FileController {
  constructor(private fileService: FileService) {}

  @Post("upload-init")
  @SkipThrottle()
  @UseGuards(IdValidation, CreateShareGuard, StrictShareOwnerGuard)
  async uploadInit(
    @Body()
    body: {
      id?: string;
      name: string;
      totalChunks: number;
    },
    @Param("shareId") shareId: string,
  ) {
    return await this.fileService.createPreSignedUploadUrls(
      shareId,
      body.name,
      body.totalChunks,
    );
  }

  @Post("upload-complete")
  @SkipThrottle()
  @UseGuards(IdValidation, CreateShareGuard, StrictShareOwnerGuard)
  async uploadComplete(
    @Body()
    body: {
      id?: string;
      name: string;
      uploadId: string;
      parts: Array<{ ETag: string; PartNumber: number }>;
    },
    @Param("shareId") shareId: string,
  ) {
    return await this.fileService.completePreSignedUpload(
      shareId,
      body.id,
      body.name,
      body.uploadId,
      body.parts,
    );
  }

  @Post("upload-abort")
  @SkipThrottle()
  @UseGuards(IdValidation, CreateShareGuard, StrictShareOwnerGuard)
  async uploadAbort(
    @Body()
    body: {
      name: string;
      uploadId: string;
    },
    @Param("shareId") shareId: string,
  ) {
    await this.fileService.abortPreSignedUpload(
      shareId,
      body.name,
      body.uploadId,
    );
  }

  @Post()
  @SkipThrottle()
  @UseGuards(IdValidation, CreateShareGuard, StrictShareOwnerGuard)
  async create(
    @Query()
    query: {
      id: string;
      name: string;
      chunkIndex: string;
      totalChunks: string;
    },
    @Body() body: string,
    @Param("shareId") shareId: string,
  ) {
    const { id, name, chunkIndex, totalChunks } = query;

    // Data can be empty if the file is empty
    return await this.fileService.create(
      body,
      { index: parseInt(chunkIndex), total: parseInt(totalChunks) },
      { id, name },
      shareId,
    );
  }

  @Get("zip")
  @UseGuards(FileSecurityGuard)
  async getZip(
    @Res({ passthrough: true }) res: Response,
    @Req() request: Request,
    @Param("shareId") shareId: string,
    @Query("recipient") recipientId?: string,
  ) {
    const { stream, name } = await this.fileService.getZip(shareId);
    // Falls back to the share's id only when it has no name to give the
    // download instead — every share created through the normal upload
    // flow gets one, so in practice this is just a safety net.
    const zipName = `${name?.trim() || shareId}.zip`;

    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(zipName),
    });

    void this.fileService.notifyDownload(
      shareId,
      zipName,
      getValidRecipientId(recipientId),
      request.ip,
      true,
    );

    return new StreamableFile(stream);
  }

  @Get(":fileId")
  @UseGuards(FileSecurityGuard)
  async getFile(
    @Res({ passthrough: true }) res: Response,
    @Req() request: Request,
    @Param("shareId") shareId: string,
    @Param("fileId") fileId: string,
    @Query("download") download = "true",
    @Query("recipient") recipientId?: string,
  ) {
    const isDownload = download === "true";
    const storageProvider = await this.fileService.getStorageProvider(shareId);

    if (storageProvider === "S3") {
      const url = await this.fileService.getPreSignedDownloadUrl(
        shareId,
        fileId,
        isDownload,
      );
      const fileName = await this.fileService.getFileName(shareId, fileId);
      if (isDownload) {
        void this.fileService.notifyDownload(
          shareId,
          fileName,
          getValidRecipientId(recipientId),
          request.ip,
        );
      }
      res.status(302).setHeader("Location", url);
      return;
    }

    const file = await this.fileService.get(
      shareId,
      fileId,
      request.headers.range,
    );

    const headers: Record<string, string> = {
      "Content-Type":
        mime?.lookup?.(file.metaData.name) || "application/octet-stream",
      "Content-Security-Policy": "sandbox",
      "Content-Disposition": contentDisposition(
        file.metaData.name,
        isDownload ? undefined : { type: "inline" },
      ),
    };

    // Only advertised when actually honored — a client that trusts this
    // header to mean "sending a Range request is worth it" would otherwise
    // be lied to while share.enableVideoRangeRequests is off, since every
    // Range it sends would still come back as a full 200 (see local.service.ts).
    if (file.rangeRequestsEnabled ?? true) {
      headers["Accept-Ranges"] = "bytes";
    }

    if (file.range) {
      const totalSize = parseInt(file.metaData.size);
      headers["Content-Range"] =
        `bytes ${file.range.start}-${file.range.end}/${totalSize}`;
      headers["Content-Length"] = (
        file.range.end -
        file.range.start +
        1
      ).toString();
      res.status(206);
    } else {
      headers["Content-Length"] = file.metaData.size;
    }

    res.set(headers);

    // Fires once per real download, not once per resumed byte-range chunk
    // — a scrubbed/resumed <video>/<audio> preview issues many Range
    // requests for one logical playback, only the first of which (start
    // === 0) should count as "downloaded".
    if (isDownload && (!file.range || file.range.start === 0)) {
      void this.fileService.notifyDownload(
        shareId,
        file.metaData.name,
        getValidRecipientId(recipientId),
        request.ip,
      );
    }

    return new StreamableFile(file.file);
  }

  @Get(":fileId/thumbnail")
  @UseGuards(FileSecurityGuard)
  async getThumbnail(
    @Res({ passthrough: true }) res: Response,
    @Param("shareId") shareId: string,
    @Param("fileId") fileId: string,
  ) {
    const thumbnail = await this.fileService.getThumbnail(shareId, fileId);

    // Not a real download — no notifyDownload call. Immutable once
    // "ready": a re-upload gets a fresh fileId, so this URL's content
    // never changes underneath a cached copy.
    res.set({
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    });

    return new StreamableFile(thumbnail.file);
  }

  @Delete(":fileId")
  @SkipThrottle()
  @UseGuards(StrictShareOwnerGuard)
  async remove(
    @Param("fileId") fileId: string,
    @Param("shareId") shareId: string,
  ) {
    await this.fileService.remove(shareId, fileId);
  }
}
