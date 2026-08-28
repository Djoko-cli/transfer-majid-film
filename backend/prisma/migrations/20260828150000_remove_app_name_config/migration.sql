-- general.appName is no longer admin-configurable — it's now the APP_NAME
-- constant (backend/src/constants.ts, frontend/src/constants.ts). The seed
-- script only inserts rows it doesn't find, so this row would otherwise be
-- left behind forever once removed from config.seed.ts.
DELETE FROM "Config" WHERE "category" = 'general' AND "name" = 'appName';
