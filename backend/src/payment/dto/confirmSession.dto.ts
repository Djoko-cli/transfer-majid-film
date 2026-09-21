import { IsNotEmpty, IsString } from "class-validator";

export class ConfirmSessionDTO {
  @IsString()
  @IsNotEmpty()
  sessionId: string;
}
