import {
  BrandCatalogProject,
  BrandSyncResult,
  DisabledBrandSlide,
} from "../types/brandSlide.type";
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

// Public too, same reasoning as getDisabled above — empty until a sync has
// actually run (see BrandSyncService on the backend).
const getCatalog = async (): Promise<BrandCatalogProject[]> => {
  return (await api.get("brand-slides/catalog")).data;
};

// URL a synced (as opposed to the static fallback's own) slide image is
// served from. Used directly as an <img>/<source> src, not through the
// `api` axios instance above — so unlike every other path in this file,
// this one DOES need the leading /api itself (api.service.ts's baseURL
// normally supplies that for us).
const getImageUrl = (
  slug: string,
  still: number,
  width: number,
  format: "avif" | "webp",
): string => `/api/brand-slides/image/${slug}/${still}/${width}/${format}`;

const syncNow = async (): Promise<BrandSyncResult> => {
  return (await api.post("brand-slides/admin/sync")).data;
};

export default {
  getDisabled,
  setDisabled,
  getCatalog,
  getImageUrl,
  syncNow,
};
