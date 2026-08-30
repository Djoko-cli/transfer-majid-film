import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class NasImportPathsDTO {
  // Top-level selections from the browser (files and/or folders) — each
  // folder is walked recursively server-side, see NasImportService.walk.
  // Capped well above any realistic manual selection; the actual file
  // count within those folders is unbounded and handled by importBatch's
  // own paging, not this limit.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  paths: string[];
}

export class NasImportCommitDTO extends NasImportPathsDTO {
  @IsOptional()
  @IsInt()
  @Min(0)
  cursor?: number;
}
