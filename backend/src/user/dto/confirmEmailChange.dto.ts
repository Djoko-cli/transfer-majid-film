import { IsString, Length } from "class-validator";

export class ConfirmEmailChangeDTO {
  @IsString()
  @Length(6, 6)
  code: string;
}
