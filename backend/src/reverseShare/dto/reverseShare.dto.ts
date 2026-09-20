import { Expose, plainToClass } from "class-transformer";

export class ReverseShareDTO {
  @Expose()
  id: string;

  // The link's own address, and the container's id — see
  // ReverseShareService.create()'s own comment on why the two are one.
  @Expose()
  token: string;

  @Expose()
  maxShareSize: string;

  @Expose()
  name: string | null;

  @Expose()
  description: string | null;

  // When deposits close. Replaces the old shareExpiration, which this DTO
  // kept exposing long after the column it read (ReverseShare.
  // shareExpiration) was renamed away in the container migration — every
  // read of it was silently undefined.
  @Expose()
  collectionEndsAt: Date;

  // When the transfer itself is removed: collectionEndsAt + retentionSeconds.
  // Computed here rather than read off containerShare.expiration, because
  // that column only carries this real value once JobsService's hourly
  // cron has closed the collection — before that it still holds the
  // 10-years-out placeholder ReverseShareService.create() writes at birth.
  @Expose()
  containerExpiresAt: Date;

  @Expose()
  contributionsCount: number;

  @Expose()
  filesCount: number;

  @Expose()
  totalSize: number;

  // How many more contributions this collection will accept — dropped
  // silently when this DTO was rewritten to show a collection instead of a
  // column of ids; the service already computes it (it's a plain spread of
  // the ReverseShare row) and ContributionService.open() already enforces
  // it, only the owner's own list never got to see it.
  @Expose()
  remainingUses: number;

  // One entry per contribution, in the same order as the count above —
  // null where nobody typed a name (the frontend falls back to the same
  // "Anonyme" label FileList.tsx already uses for the public transfer, rather
  // than baking a display string into the API response).
  @Expose()
  contributorNames: (string | null)[];

  from(partial: Partial<ReverseShareDTO>) {
    return plainToClass(ReverseShareDTO, partial, {
      excludeExtraneousValues: true,
    });
  }

  fromList(partial: Partial<ReverseShareDTO>[]) {
    return partial.map((part) =>
      plainToClass(ReverseShareDTO, part, {
        excludeExtraneousValues: true,
      }),
    );
  }
}
