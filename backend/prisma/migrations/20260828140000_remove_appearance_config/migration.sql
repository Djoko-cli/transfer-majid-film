-- The "appearance" config category (theme primary color, radius, default
-- color scheme, custom CSS, upload progress style) is no longer
-- admin-configurable — every one of those values is now a fixed constant in
-- the frontend code (mantine.style.ts, UploadProgressIndicator.tsx) instead
-- of a database row, so changing any of them ships through a normal
-- build/deploy rather than the admin UI. The seed script only ever inserts
-- rows it doesn't find, so removing the category from config.seed.ts alone
-- would leave these 6 rows behind forever — delete them explicitly instead.
DELETE FROM "Config" WHERE "category" = 'appearance';
