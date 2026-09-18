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
  @Expose()
  contributionId: string | null;

  share: ShareDTO;

  from(partial: Partial<FileDTO>) {
    return plainToClass(FileDTO, partial, { excludeExtraneousValues: true });
  }
}
