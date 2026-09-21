import { Type } from "class-transformer";
import {
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { i18nValidationMessage } from "nestjs-i18n";
import { ShareSecurityDTO } from "./shareSecurity.dto";

export class CreateShareDTO {
  @IsString()
  @Matches("^[a-zA-Z0-9_-]*$", undefined, {
    message: i18nValidationMessage("validation.idPattern"),
  })
  @Length(3, 50)
  id: string;

  @Length(3, 30)
  @IsOptional()
  name: string;

  @IsString()
  expiration: string;

  @MaxLength(512)
  @IsOptional()
  description: string;

  @IsEmail({}, { each: true })
  recipients: string[];

  // Self-reported by an anonymous (not signed-in) sender — ignored server
  // side for a signed-in requester, see ShareService.create().
  @IsEmail()
  @IsOptional()
  senderEmail?: string;

  @ValidateNested()
  @Type(() => ShareSecurityDTO)
  security: ShareSecurityDTO;

  @IsNumber()
  @IsOptional()
  size: number;

  // The cap isn't decorative: it bounds what a forged request can ask
  // Stripe to charge (see ShareService.create's admin-only guard, which is
  // the other half of that protection — this DTO alone only rejects a
  // non-integer, negative, or absurd amount, not a non-admin sender).
  @IsInt()
  @Min(0)
  @Max(100_000_00)
  @IsOptional()
  priceCents?: number;
}
