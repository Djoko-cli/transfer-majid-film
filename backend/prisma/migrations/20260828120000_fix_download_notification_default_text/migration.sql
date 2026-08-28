-- The original migration
-- (20260527000000_add_share_download_notification_email_config) that
-- inserted this row's default text was later edited in place to drop the
-- old pre-rebrand product sign-off line. Editing an already-applied migration's SQL
-- has no effect on a database that already ran it — the INSERT only
-- executes once, at first-apply time — so any database that applied that
-- migration before the edit still carries the old sign-off in this row's
-- defaultValue. This UPDATE corrects it going forward, on top of that
-- migration being restored to its original (checksum-matching) text. Only
-- defaultValue is touched, never value, so an admin's own customization of
-- this template is left untouched.
UPDATE "Config"
SET "defaultValue" = 'Hey!\n\n{recipientEmail} downloaded {fileName} from your share: {shareUrl}'
WHERE "category" = 'email' AND "name" = 'shareDownloadNotificationMessage';
