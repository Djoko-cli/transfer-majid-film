// The still-image catalog behind BrandPanel.tsx's public slideshow, and the
// same catalog the admin brand-slide curation page (pages/admin/brand.tsx)
// browses to let an admin pick which of these are actually eligible for
// that rotation. Kept in its own module, rather than inline in BrandPanel,
// specifically so both can import the exact same data with nothing
// duplicated between them.
export type BrandProject = {
  slug: string;
  title: string;
  year: string;
  // Which numbered stills exist for this project (all sharing `widths`, or
  // the project-level `widths` override, or BrandPanel's own
  // STANDARD_WIDTHS) — mutually exclusive with `stillWidths` below.
  stills?: number[];
  widths?: number[];
  // Used instead of `stills`+`widths` when widths vary between stills of
  // the same project (a still's own native resolution, not a
  // project-level property).
  stillWidths?: Record<number, number[]>;
};

// One entry per project. Width availability is a property of each
// individual source photo (its native resolution), not of the project as a
// whole, so a project's stills can each need their own override — `kalou`'s
// s4/s5 top out at 2228px while its s1-s3 reach 4096px, for instance.
export const PROJECTS: BrandProject[] = [
  {
    slug: "apetitfeu",
    title: "À petit feu",
    year: "2024",
    stills: [1, 2, 3, 4, 5],
  },
  { slug: "atr", title: "ATR", year: "2022", stills: [1, 2, 3, 4, 5] },
  {
    slug: "battle",
    title: "Battle - La Rényon",
    year: "2024",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "bluesmaron",
    title: "À la rencontre du blues maron",
    year: "2023",
    stills: [1, 2, 3, 4, 5, 15],
  },
  {
    slug: "cavacava",
    title: "Ça va ? Ça va",
    year: "2024",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "cilam-couple",
    title: "Des instants qui comptent - Couple",
    year: "2026",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "cilam-grand-pere",
    title: "Des instants qui comptent - Grand-père",
    year: "2026",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "dbba",
    title: "Dann' Babadzyé Artemis",
    year: "2025",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "foli",
    title: "FOLÏ",
    year: "2024",
    stills: [1, 2, 3, 4, 5],
    widths: [640, 1280, 1920],
  },
  {
    slug: "grave-dans-la-peau",
    title: "Gravé dans la peau",
    year: "2025",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "hyundai-i10-n-line",
    title: "i10 N Line",
    year: "2024",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "kalou",
    title: "KALOU",
    year: "2023",
    stillWidths: {
      1: [640, 1280, 2048, 4096],
      2: [640, 1280, 2048, 4096],
      3: [640, 1280, 2048, 4096],
      4: [640, 1280, 2048, 2228],
      5: [640, 1280, 2048, 2228],
    },
  },
  { slug: "kaskole", title: "KASKOLÉ", year: "2023", stills: [1, 2, 3, 4, 5] },
  {
    slug: "lanrl",
    title: "La NRL, La Nouvelle Réunion Libre",
    year: "2023",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "lespotscasses",
    title: "Les Pots Cassés",
    year: "2023",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "quartierruisseau",
    title: "Quartier Ruisseau",
    year: "2023",
    stills: [1, 2, 3, 4, 5],
    widths: [640, 1280, 2048, 2880],
  },
  {
    slug: "sfr-noel",
    title: "La connexion entre nous, ça se fête !",
    year: "2024",
    stills: [1, 2, 3, 4, 5],
    widths: [640, 1280, 2048, 3193],
  },
  { slug: "sovaz", title: "SOVAZ", year: "2023", stills: [1, 2, 3, 4, 5] },
  {
    slug: "standup",
    title: "Stand Up !",
    year: "2026",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "thousanddays",
    title: "THOUSANDS DAYS",
    year: "2023",
    stills: [1, 2, 3, 4, 5],
  },
  {
    slug: "tordballe",
    title: "Tord Balle",
    year: "2024",
    stills: [1, 2, 3, 4, 5],
  },
];

// Which still numbers a project actually has — width-agnostic, unlike
// BrandPanel's own SLIDES derivation (which also resolves each still's
// widths and stays local to BrandPanel.tsx). Used by the admin curation
// page (pages/admin/brand.tsx), which only ever needs to know which
// stills exist, never how they're served.
export const getProjectStillNumbers = (project: BrandProject): number[] =>
  project.stillWidths
    ? Object.keys(project.stillWidths).map(Number)
    : (project.stills ?? []);
