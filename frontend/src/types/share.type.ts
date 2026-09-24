import User from "./user.type";

// One contribution's summary, as ShareDTO.collection.contributions carries
// it — enough for FileList to group and caption a group ("40 photos de
// Sophie · 12 septembre"), not the files themselves (those still come
// through Share.files, each tagged with its own contributionId).
export type ShareCollectionContribution = {
  id: string;
  name?: string;
  createdAt: Date;
  fileCount: number;
};

// Present on Share only when isCollection is true — see
// ShareController.buildCollectionState(), the sole place that assembles it.
export type ShareCollection = {
  isOpen: boolean;
  endsAt: Date;
  description?: string;
  // Whether a completed deposit emails the collection's creator. Optional
  // because a backend older than this field simply omits it.
  notifiesCreator?: boolean;
  contributions: ShareCollectionContribution[];
};

export type Share = {
  id: string;
  name?: string;
  files: any;
  creator?: User;
  description?: string;
  expiration: Date;
  size: number;
  hasPassword: boolean;
  isCollection?: boolean;
  collection?: ShareCollection;
  // Null/undefined = gratuit. Set on Share.priceCents (backend/prisma) and
  // carried here by ShareDTO only since it got its own @Expose() — see
  // that file's own comment for why it needed one at all.
  priceCents?: number | null;
  // Computed server-side by ShareController.get() from isPaidFor() plus
  // the creator/admin exceptions shareSecurity.guard.ts also grants — never
  // computed here. It only ever decides what this page SHOWS (the paywall
  // vs. the download buttons); the guard is what actually decides whether
  // a file byte leaves the server.
  isPaidForViewer?: boolean;
};

export type CompletedShare = Share;

export type CreateShare = {
  id: string;
  name?: string;
  description?: string;
  recipients: string[];
  // Self-reported by an anonymous (not signed-in) sender only — ignored
  // server side for a signed-in requester (ShareService.create()).
  senderEmail?: string;
  expiration: string;
  security: ShareSecurity;
  size?: number;
  // Admin-only (backend/src/share/share.service.ts rejects it otherwise) —
  // set from TransferCard's priceEuros field, already rounded to whole
  // cents before it gets here.
  priceCents?: number;
};

// How the sender chose to deliver the transfer: a plain shareable link, or
// direct emails to named recipients. Shared across TransferCard (where it's
// picked), UploadPage (where it's threaded to the completion modal), and
// showCompletedUploadModal (where it decides whether to show the raw link).
export type Mode = "email" | "link";

export type UpdateShare = {
  name?: string | null;
  description?: string | null;
  expiration?: string;
  security?: {
    password?: string;
    removePassword?: boolean;
    maxViews?: number | null;
  };
};

export type ShareMetaData = {
  id: string;
  isZipReady: boolean;
};

export type ShareDownload = {
  id: string;
  createdAt: Date;
  // null = the whole share (a zip download), not a single file
  fileName: string | null;
  // null = anonymous / Link-mode visitor, not a named Email-mode recipient
  recipientEmail: string | null;
  ipAddress: string | null;
};

export type MyShare = Omit<Share, "hasPassword"> & {
  views: number;
  createdAt: Date;
  recipients: string[];
  security: MyShareSecurity;
};

// As ReverseShareDTO carries it to the owner's management page — an
// aggregate view of the collection, not the raw rows behind it (see
// ReverseShareService.getAllByUser()).
export type MyReverseShare = {
  id: string;
  token: string;
  maxShareSize: string;
  name: string | null;
  description: string | null;
  collectionEndsAt: Date;
  containerExpiresAt: Date;
  contributionsCount: number;
  filesCount: number;
  totalSize: number;
  // How many more contributions this collection will accept. Read
  // alongside collectionEndsAt to decide whether it is still open — the
  // server folds the same two conditions into the transfer's own isOpen.
  remainingUses: number;
  // null where nobody typed a name — the page falls back to the same
  // "Anonyme" label the public page uses (share.collection.anonymous).
  contributorNames: (string | null)[];
};

export type ShareSecurity = {
  maxViews?: number;
  password?: string;
  restrictToRecipients?: boolean;
};

export type MyShareSecurity = {
  passwordProtected: boolean;
  maxViews?: number;
  restrictToRecipients: boolean;
};
