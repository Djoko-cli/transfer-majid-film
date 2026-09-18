import { Expose, plainToClass } from "class-transformer";
import { ShareDTO } from "src/share/dto/share.dto";

export class FileDTO {
  @Expose()
  id: string;

  @Expose()
  name: string;

  @Expose()
  size: string;

  @Expose()
  thumbnailStatus: string | null;

  // Which contribution this file arrived with — null for a file that
  // predates the column, for any ordinary transfer, and for a file the
  // collection's own owner added through the plain upload route (see
  // ShareDTO.collection's own comment). Needed client-side so FileList can
  // group an album's files by contribution instead of just knowing the
  // per-contribution counts.
  //
  // On the one route every album reader hits (ShareController.get()), this
  // is never the real ShareContribution id — that id is also the one
  // credential ContributionGuard checks before writing into or closing a
  // contribution, so publishing it here would let anyone past the
  // password gate post into (and complete) another contributor's still-
  // open upload. ShareController.buildCollectionState() rewrites it to an
  // opaque per-response key instead, matching collection.contributions[].id
  // (see that method's own comment). Only the owner-only `/from-owner`
  // route still carries the real value.
  @Expose()
  contributionId: string | null;

  share: ShareDTO;

  from(partial: Partial<FileDTO>) {
    return plainToClass(FileDTO, partial, { excludeExtraneousValues: true });
  }
}
