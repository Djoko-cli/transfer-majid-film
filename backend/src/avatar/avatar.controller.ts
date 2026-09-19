import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { User } from "@prisma/client";
import { Request, Response } from "express";
import { I18nService } from "nestjs-i18n";
import { GetUser } from "src/auth/decorator/getUser.decorator";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { UserDTO } from "../user/dto/user.dto";
import { AvatarService } from "./avatar.service";
import { UndecodableAvatarError } from "./avatarImage";

// Toutes les routes sont sur soi-même : l'identifiant vient du jeton, jamais
// d'un paramètre. Il n'existe donc aucun chemin qui serve l'avatar d'un autre
// compte, ce qui est la forme la plus simple de la règle « visible par son seul
// propriétaire ».
@Controller("users/me/avatar")
export class AvatarController {
  constructor(
    private avatar: AvatarService,
    private i18n: I18nService,
  ) {}

  @Post()
  @UseGuards(JwtGuard)
  async upload(@GetUser() user: User, @Req() request: Request) {
    const bytes = request.body;
    if (!Buffer.isBuffer(bytes) || bytes.length === 0)
      throw new BadRequestException(this.i18n.t("avatar.empty"));

    try {
      const avatarUpdatedAt = await this.avatar.store(user.id, bytes);
      return new UserDTO().from({ ...user, avatarUpdatedAt });
    } catch (error) {
      if (error instanceof UndecodableAvatarError)
        throw new BadRequestException(this.i18n.t("avatar.undecodable"));
      throw error;
    }
  }

  @Get()
  @UseGuards(JwtGuard)
  async read(
    @GetUser() user: User,
    @Res({ passthrough: true }) response: Response,
  ) {
    const stream = await this.avatar.read(user.id);
    response.set({
      "Content-Type": "image/webp",
      // Un an et `immutable` ne sont corrects que parce que le front demande
      // toujours l'URL avec `?v=<avatarUpdatedAt en ms>` : changer de photo
      // change `v`, donc change l'URL, donc contourne ce cache. `private`
      // parce que l'image appartient à un compte et n'a rien à faire dans un
      // cache partagé.
      "Cache-Control": "private, max-age=31536000, immutable",
    });
    return new StreamableFile(stream);
  }

  @Delete()
  @HttpCode(204)
  @UseGuards(JwtGuard)
  async remove(@GetUser() user: User) {
    await this.avatar.remove(user.id);
  }
}
