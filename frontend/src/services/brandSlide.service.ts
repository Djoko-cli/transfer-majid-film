import { DisabledBrandSlide } from "../types/brandSlide.type";
import api from "./api.service";

// Public — no auth required, matches the backend route (BrandPanel.tsx
// calls this unauthenticated, on the sign-in page among others).
const getDisabled = async (): Promise<DisabledBrandSlide[]> => {
  return (await api.get("brand-slides/disabled")).data;
};

const setDisabled = async (
  slug: string,
  still: number,
  disabled: boolean,
): Promise<DisabledBrandSlide & { disabled: boolean }> => {
  return (await api.patch(`brand-slides/admin/${slug}/${still}`, { disabled }))
    .data;
};

export default {
  getDisabled,
  setDisabled,
};
