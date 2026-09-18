import { Expose, plainToClass, Type } from "class-transformer";
import { FileDTO } from "src/file/dto/file.dto";
import { PublicUserDTO } from "src/user/dto/publicUser.dto";

export class ShareDTO {
  @Expose()
  id: string;

  @Expose()
  name?: string;

  @Expose()
  expiration: Date;

  @Expose()
  @Type(() => FileDTO)
  files: FileDTO[];

  @Expose()
  @Type(() => PublicUserDTO)
  creator: PublicUserDTO;

  @Expose()
  description: string;

  @Expose()
  hasPassword: boolean;

  @Expose()
  size: number;

  @Expose()
  isCollection: boolean;

  // Deliberately NOT @Expose()d — whether a share's files were imported
  // from the NAS or uploaded normally must be invisible to whoever's
  // downloading it, not just unstyled in the UI. FileService.getZip()
  // and ShareService.complete() read the real Prisma field directly
  // server-side; nothing recipient-facing should ever see it.
  hasNasImportedFiles?: boolean;

  from(partial: Partial<ShareDTO>) {
    return plainToClass(ShareDTO, partial, { excludeExtraneousValues: true });
  }

  fromList(partial: Partial<ShareDTO>[]) {
    return partial.map((part) =>
      plainToClass(ShareDTO, part, { excludeExtraneousValues: true }),
    );
  }
}
