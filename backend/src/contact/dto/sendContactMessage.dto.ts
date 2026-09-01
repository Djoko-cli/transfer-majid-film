import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class SendContactMessageDTO {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  subject: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(5000)
  message: string;

  // Set by the frontend from the signed-in visitor's own account email, if
  // any — lets ContactService thread a real Reply-To instead of the
  // message landing with no way back to whoever sent it. Absent for an
  // anonymous visitor; still validated as a real email shape regardless,
  // since this is client-supplied like every other field here.
  @IsEmail()
  @IsOptional()
  replyTo?: string;

  // Honeypot — a field no real visitor sees or fills (hidden off-screen in
  // the actual form), so anything here at all means a bot filled every
  // input it could find. ContactController responds exactly as if the
  // message had sent, without actually sending it — a bot that gets the
  // normal "success" response has no signal telling it which field to stop
  // filling next time.
  @IsString()
  @IsOptional()
  website?: string;
}
