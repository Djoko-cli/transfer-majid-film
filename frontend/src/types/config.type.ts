type Config = {
  key: string;
  defaultValue: string;
  value: string;
  type: string;
};

export type UpdateConfig = {
  key: string;
  // Matches the backend's own UpdateConfigDTO exactly (string | number |
  // boolean) — AdminConfigInput.tsx's Switch fields already pass a real
  // boolean here at runtime (e.value.checked), just through an `any`
  // parameter that didn't surface the mismatch until a second, more
  // narrowly-typed caller (pages/admin/brand.tsx) needed to pass one too.
  value: string | number | boolean;
};

export type AdminConfig = Config & {
  name: string;
  updatedAt: Date;
  secret: boolean;
  description: string;
  obscured: boolean;
  allowEdit: boolean;
  mirroredToFile: boolean;
  mirroredToSecretsFile: boolean;
  mirrorWriteError: string | null;
};

export type AdminConfigGroupedByCategory = {
  [key: string]: [
    Config & {
      updatedAt: Date;
      secret: boolean;
      description: string;
      obscured: boolean;
      category: string;
    },
  ];
};

export type ConfigVariablesCategory = {
  category: string;
  count: number;
};

export type ConfigHook = {
  configVariables: Config[];
  refresh: () => void;
};

export default Config;
