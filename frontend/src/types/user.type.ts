type User = {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  isActivated: boolean;
  isLdap: boolean;
  totpVerified: boolean;
  hasPassword: boolean;
  // Set while an email change is waiting on a code sent to that address.
  pendingEmail?: string;
  pendingEmailLastSentAt?: string;
  shareSizeLimit?: string;
  storageQuotaLimit?: string;
  canCreatePermanentShares?: boolean;
  notifyOnExpiringSentShares?: boolean;
  notifyOnSentShares?: boolean;
};

export type CreateUser = {
  username: string;
  email: string;
  password?: string;
  isAdmin?: boolean;
  shareSizeLimit?: string | null;
  storageQuotaLimit?: string | null;
  canCreatePermanentShares?: boolean;
};

export type UpdateUser = {
  username?: string;
  email?: string;
  password?: string;
  isAdmin?: boolean;
  isActivated?: boolean;
  shareSizeLimit?: string | null;
  storageQuotaLimit?: string | null;
  canCreatePermanentShares?: boolean;
};

export type UpdateCurrentUser = {
  username?: string;
  email?: string;
  notifyOnExpiringSentShares?: boolean;
  notifyOnSentShares?: boolean;
};

export type CurrentUser = User & {};

export type UserHook = {
  user: CurrentUser | null;
  refreshUser: () => Promise<CurrentUser | null>;
};

export default User;
