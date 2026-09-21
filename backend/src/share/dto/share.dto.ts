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

  // Null = gratuit — see Share.priceCents in schema.prisma. Without
  // @Expose(), excludeExtraneousValues silently drops it and the frontend
  // would never see a price to show a paywall for at all.
  @Expose()
  priceCents?: number | null;

  // Calculé côté serveur par ShareController.get() (jamais côté client :
  // un booléen calculé dans le navigateur n'est pas une autorisation), et
  // sans @Expose() il ne sortirait jamais du serveur, comme priceCents
  // ci-dessus. Dit à la page si le bouton "Débloquer" doit remplacer les
  // téléchargements — mais l'autorité reste entièrement dans
  // shareSecurity.guard.ts : ce booléen ne fait qu'un affichage, au pire
  // il se trompe d'écran, jamais il n'ouvre un fichier.
  @Expose()
  isPaidForViewer?: boolean;

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
      // or close a contribution, so publishing it to every transfer reader
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
