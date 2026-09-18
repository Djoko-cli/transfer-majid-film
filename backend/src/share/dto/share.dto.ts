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

  // Only ever populated for a collection (see ShareController.get(), which
  // is the only place this is assembled — ShareService.get() itself stays
  // ignorant of contributions). A plain transfer's response simply omits
  // the key, since a nested plain object outside excludeExtraneousValues's
  // reach isn't itself filtered by @Expose(): the frontend types this as
  // optional and reads it accordingly.
  @Expose()
  collection?: {
    isOpen: boolean;
    endsAt: Date;
    description?: string;
    contributions: {
      // Never the real ShareContribution id — see
      // ShareController.buildCollectionState()'s own comment for why: that
      // id is also what ContributionGuard trusts to let a POST write into
      // or close a contribution, so publishing it to every album reader
      // would let anyone past the password gate impersonate an open
      // deposit. This is an opaque key, stable only within this one
      // response, and FileDTO.contributionId is rewritten to match it.
      id: string;
      name?: string;
      createdAt: Date;
      fileCount: number;
    }[];
  };

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
