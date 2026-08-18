import { IsEmail, IsNotEmpty } from "class-validator";

export class RequestCodeDTO {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
