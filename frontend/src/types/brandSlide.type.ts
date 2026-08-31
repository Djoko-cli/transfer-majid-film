export type DisabledBrandSlide = {
  slug: string;
  still: number;
};

// The live, synced catalog (GET brand-slides/catalog) — shaped to flatten
// exactly like frontend/src/data/brandProjects.ts's own static PROJECTS
// does, so BrandPanel.tsx can treat both sources uniformly once flattened.
export type BrandCatalogStill = {
  still: number;
  widths: number[];
};

export type BrandCatalogProject = {
  slug: string;
  title: string;
  year: string;
  stills: BrandCatalogStill[];
};

// Only the success shape — the backend's own {ok:false, reason} case
// (not configured / already running) never reaches here as a 200:
// brandSlides.controller.ts's sync route translates that into a thrown
// HTTP exception instead, which the frontend sees as a rejected request
// (see brandSlide.service.ts's syncNow, caught via toast.axiosError,
// showing the backend's own i18n'd message).
export type BrandSyncResult = {
  newProjects: number;
  updatedProjects: number;
  newStills: number;
  warnings: string[];
};
