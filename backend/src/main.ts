import { ClassSerializerInterceptor, Logger, LogLevel } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import * as bodyParser from "body-parser";
import * as cookieParser from "cookie-parser";
import { NextFunction, Request, Response } from "express";
import * as fs from "fs";
import { I18nValidationExceptionFilter, I18nValidationPipe } from "nestjs-i18n";
import { AppModule } from "./app.module";
import { ConfigService } from "./config/config.service";
import {
  AVATAR_MAX_BYTES,
  DATA_DIRECTORY,
  LOG_LEVEL_AVAILABLE,
  LOG_LEVEL_DEFAULT,
  LOG_LEVEL_ENV,
} from "./constants";

function generateNestJsLogLevels(): LogLevel[] {
  if (LOG_LEVEL_ENV) {
    const levelIndex = LOG_LEVEL_AVAILABLE.indexOf(LOG_LEVEL_ENV as any);
    if (levelIndex === -1) {
      throw new Error(`log level ${LOG_LEVEL_ENV} unknown`);
    }

    return LOG_LEVEL_AVAILABLE.slice(levelIndex, LOG_LEVEL_AVAILABLE.length);
  } else {
    const levelIndex = LOG_LEVEL_AVAILABLE.indexOf(LOG_LEVEL_DEFAULT);
    return LOG_LEVEL_AVAILABLE.slice(levelIndex, LOG_LEVEL_AVAILABLE.length);
  }
}

async function bootstrap() {
  const logLevels = generateNestJsLogLevels();
  Logger.log(`Showing ${logLevels.join(", ")} messages`);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: logLevels,
    // Rend `request.rawBody` disponible pour la vérification de signature du
    // webhook Stripe, qui recalcule un HMAC sur les octets reçus — un corps
    // JSON analysé puis re-sérialisé ne donne pas le même condensé, et toute
    // signature valide serait rejetée. Nest ne garde cette copie brute que
    // pour les corps qu'il parse LUI-MÊME (JSON, urlencoded) ; le
    // téléversement par morceaux, en `application/octet-stream`, passe par
    // le middleware maison juste en dessous et n'est donc pas dupliqué par
    // cette option. Le coût : chaque corps JSON/urlencodé est gardé deux
    // fois en mémoire pour la durée de la requête.
    rawBody: true,
  });

  app.useGlobalPipes(new I18nValidationPipe({ whitelist: true }));
  app.useGlobalFilters(new I18nValidationExceptionFilter());
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  const config = app.get<ConfigService>(ConfigService);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const chunkSize = config.get("share.chunkSize");
    bodyParser.raw({
      type: "application/octet-stream",
      limit: `${chunkSize}B`,
    })(req, res, next);
  });

  // Le parseur ci-dessus ne traite que `application/octet-stream` et se cale sur
  // `share.chunkSize`. S'en servir pour les avatars coupleraient deux limites
  // sans rapport : un admin qui baisse la taille de chunk casserait l'envoi de
  // photos sans jamais faire le lien. Celui-ci est borné au seul chemin
  // concerné, et porte sa propre limite.
  //
  // Le chemin contient `/api` parce que `setGlobalPrefix("api")` est appelé
  // plus bas : Express filtre sur l'URL réellement reçue, pas sur la route Nest.
  app.use(
    "/api/users/me/avatar",
    bodyParser.raw({ type: "image/*", limit: AVATAR_MAX_BYTES }),
  );

  // Signed so oauth.guard.ts's CSRF check actually proves the request came
  // back from the browser this flow started in, not merely that the caller
  // knows the `state` value — see that guard's own comment. `jwtSecret` is
  // this app's one existing per-instance secret (256 random bytes, minted
  // once at install, already trusted for signing every access/refresh
  // token) rather than a new one: it already exists in every deployed
  // database, so reusing it needs no migration for anyone upgrading.
  app.use(cookieParser(config.get("internal.jwtSecret")));
  app.set("trust proxy", process.env.TRUST_PROXY === "true");

  await fs.promises.mkdir(`${DATA_DIRECTORY}/uploads/_temp`, {
    recursive: true,
  });

  app.setGlobalPrefix("api");

  // Setup Swagger in development mode
  if (process.env.NODE_ENV == "development") {
    const config = new DocumentBuilder()
      .setTitle("Transfer API")
      .setVersion("1.0")
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup("api/swagger", app, document);
  }

  await app.listen(
    parseInt(process.env.BACKEND_PORT || process.env.PORT || "8080"),
  );

  const logger = new Logger("UnhandledAsyncError");
  process.on("unhandledRejection", (e) => logger.error(e));
}
bootstrap();
