import { IsEmail, IsNotEmpty, Length } from "class-validator";

export class VerifyCodeDTO {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsNotEmpty()
  @Length(6, 6)
  code: string;
}
