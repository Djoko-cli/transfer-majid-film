import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { i18nValidationMessage } from "nestjs-i18n";

export class CreateReverseShareDTO {
  @IsBoolean()
  sendEmailNotification: boolean;

  @IsString()
  @Matches(/^[0-9]+$/, {
    message: "maxShareSize must contain only digits",
  })
  maxShareSize: string;

  // When depositing stops, as a relative "3-days" string, same shape as
  // the field it replaces.
  @IsString()
  collectionEndsAt: string;

  // How long the album survives after that, same shape.
  @IsString()
  retention: string;

  @Min(1)
  @Max(1000)
  maxUseCount: number;

  @IsBoolean()
  publicAccess: boolean;

  // Same shape as a direct share's own optional description/security
  // (CreateShareDTO/ShareSecurityDTO) — set once here by this reverse
  // share's own creator, applied to every share created through it
  // (ShareService.create()'s own override), rather than left for
  // whoever uploads to configure per-submission.
  @MaxLength(512)
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  @Length(3, 30)
  password?: string;

  @IsNumber()
  @IsOptional()
  maxViews?: number;

  // The container's own id, chosen by the creator — never generated for
  // them any more, now that it is the collection's one public address
  // rather than a bearer token (see ReverseShareService.create()).
  @IsString()
  @Matches("^[a-zA-Z0-9_-]+$", undefined, {
    message: i18nValidationMessage("validation.idPattern"),
  })
  @Length(3, 50)
  token: string;

  // Same bounds as a direct share's own name (CreateUploadModalBody's own
  // yup validation) — the two are the same concept, just set by whoever
  // is allowed to for each: the sender themselves for a direct share, only
  // this reverse share's own creator here.
  @IsString()
  @IsOptional()
  @Length(3, 30)
  name?: string;
}
