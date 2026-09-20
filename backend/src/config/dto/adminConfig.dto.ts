import { Expose, plainToClass } from "class-transformer";
import { ConfigDTO } from "./config.dto";

export class AdminConfigDTO extends ConfigDTO {
  @Expose()
  name: string;

  @Expose()
  secret: boolean;

  @Expose()
  defaultValue: string;

  @Expose()
  updatedAt: Date;

  @Expose()
  obscured: boolean;

  // Ce qui remplace `value` à l'écran pour un réglage obscured, dont la
  // valeur elle-même ne traverse jamais cette DTO (voir
  // obscuredValue.util.ts) : sans lui, un champ vide veut dire « non posé »
  // autant que « posé mais masqué ».
  @Expose()
  isSet: boolean;

  @Expose()
  allowEdit: boolean;

  @Expose()
  mirroredToFile: boolean;

  @Expose()
  mirroredToSecretsFile: boolean;

  @Expose()
  mirrorWriteError: string | null;

  from(partial: Partial<AdminConfigDTO>) {
    return plainToClass(AdminConfigDTO, partial, {
      excludeExtraneousValues: true,
    });
  }

  fromList(partial: Partial<AdminConfigDTO>[]) {
    return partial.map((part) =>
      plainToClass(AdminConfigDTO, part, { excludeExtraneousValues: true }),
    );
  }
}
