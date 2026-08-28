-- general.showHomePage is retired: its only real effect (deciding whether
-- "/" is public) is now folded entirely into share.allowUnauthenticatedShares
-- — anonymous uploads and site-wide visibility are the same decision (see
-- middleware.ts). The seed script only inserts rows it doesn't find, so this
-- row would otherwise be left behind forever once removed from
-- config.seed.ts.
DELETE FROM "Config" WHERE "category" = 'general' AND "name" = 'showHomePage';
