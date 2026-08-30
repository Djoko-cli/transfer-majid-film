import { IsBoolean, IsOptional, IsString } from "class-validator";

export class AuthSignInTotpDTO {
  @IsString()
  totp: string;

  @IsString()
  loginToken: string;

  @IsBoolean()
  @IsOptional()
  rememberDevice?: boolean;
}
