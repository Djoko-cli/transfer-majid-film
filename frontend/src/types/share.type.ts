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
// ShareController.getCollectionState(), the sole place that assembles it.
export type ShareCollection = {
  isOpen: boolean;
  endsAt: Date;
  description?: string;
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
  // null where nobody typed a name — the page falls back to the same
  // "Anonyme" label the public album uses (share.collection.anonymous).
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
