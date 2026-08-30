import { IsOptional, IsString } from "class-validator";

export class NasBrowseDTO {
  @IsOptional()
  @IsString()
  path?: string;
}
