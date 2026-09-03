import { Expose, plainToClass } from "class-transformer";

export class ShareDownloadDTO {
  @Expose()
  id: string;

  @Expose()
  createdAt: Date;

  @Expose()
  fileName: string | null;

  @Expose()
  recipientEmail: string | null;

  from(partial: Partial<ShareDownloadDTO>) {
    return plainToClass(ShareDownloadDTO, partial, {
      excludeExtraneousValues: true,
    });
  }

  fromList(partial: Partial<ShareDownloadDTO>[]) {
    return partial.map((part) =>
      plainToClass(ShareDownloadDTO, part, { excludeExtraneousValues: true }),
    );
  }
}
