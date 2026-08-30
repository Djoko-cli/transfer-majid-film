import { IsEmail, IsNotEmpty, IsString, Length } from "class-validator";

export class VerifyAccountCodeDTO {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  code: string;
}
