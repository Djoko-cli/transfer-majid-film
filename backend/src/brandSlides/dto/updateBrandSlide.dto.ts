import { IsBoolean } from "class-validator";

export class UpdateBrandSlideDTO {
  @IsBoolean()
  disabled: boolean;
}
