import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { User } from "@prisma/client";
import { Response } from "express";
import { GetUser } from "src/auth/decorator/getUser.decorator";
import { AdministratorGuard } from "src/auth/guard/isAdmin.guard";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { ConfigService } from "../config/config.service";
import { CreateUserDTO } from "./dto/createUser.dto";
import { ConfirmEmailChangeDTO } from "./dto/confirmEmailChange.dto";
import { UpdateOwnUserDTO } from "./dto/updateOwnUser.dto";
import { UpdateUserDto } from "./dto/updateUser.dto";
import { UserDTO } from "./dto/user.dto";
import { UserSevice } from "./user.service";

@Controller("users")
export class UserController {
  constructor(
    private userService: UserSevice,
    private config: ConfigService,
  ) {}

  // Own user operations
  @Get("me")
  @UseGuards(JwtGuard)
  async getCurrentUser(@GetUser() user?: User) {
    if (!user) return null;
    const userDTO = new UserDTO().from(user);
    userDTO.hasPassword = !!user.password;
    return userDTO;
  }

  @Patch("me")
  @UseGuards(JwtGuard)
  async updateCurrentUser(
    @GetUser() user: User,
    @Body() data: UpdateOwnUserDTO,
  ) {
    // The email is pulled out of the ordinary update and routed through
    // verification instead: it is the one field here that decides where the
    // account's own recovery — and now the Reply-To on everything they send
    // — lands, so it does not get written just because someone typed it.
    const { email, ...rest } = data;
    let updated = await this.userService.update(user.id, rest);

    if (email !== undefined)
      updated = await this.userService.requestEmailChange(user.id, email);

    return new UserDTO().from(updated);
  }

  @Post("me/email/confirm")
  @HttpCode(200)
  @UseGuards(JwtGuard)
  async confirmEmailChange(
    @GetUser() user: User,
    @Body() dto: ConfirmEmailChangeDTO,
  ) {
    return new UserDTO().from(
      await this.userService.confirmEmailChange(user.id, dto.code),
    );
  }

  // The throttle is the outer fence — per IP, cheap, refuses a flood before
  // it reaches the database. The service checks the row's own last-sent
  // timestamp behind it, which is the fence that actually matches what is
  // being protected: one account's mailbox.
  @Post("me/email/resend")
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60 * 1000 } })
  @UseGuards(JwtGuard)
  async resendEmailChangeCode(@GetUser() user: User) {
    return new UserDTO().from(
      await this.userService.resendEmailChangeCode(user.id),
    );
  }

  @Delete("me/email")
  @UseGuards(JwtGuard)
  async cancelEmailChange(@GetUser() user: User) {
    return new UserDTO().from(
      await this.userService.cancelEmailChange(user.id),
    );
  }

  @Delete("me")
  @HttpCode(204)
  @UseGuards(JwtGuard)
  async deleteCurrentUser(
    @GetUser() user: User,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.userService.delete(user.id);

    const isSecure = this.config.get("general.secureCookies");

    response.cookie("access_token", "accessToken", {
      maxAge: -1,
      secure: isSecure,
    });
    response.cookie("refresh_token", "", {
      path: "/api/auth/token",
      httpOnly: true,
      maxAge: -1,
      secure: isSecure,
    });
  }

  // Global user operations
  @Get()
  @UseGuards(JwtGuard, AdministratorGuard)
  async list() {
    return new UserDTO().fromList(await this.userService.list());
  }

  @Post()
  @UseGuards(JwtGuard, AdministratorGuard)
  async create(@Body() user: CreateUserDTO) {
    return new UserDTO().from(await this.userService.create(user));
  }

  @Patch(":id")
  @UseGuards(JwtGuard, AdministratorGuard)
  async update(@Param("id") id: string, @Body() user: UpdateUserDto) {
    return new UserDTO().from(await this.userService.update(id, user));
  }

  @Delete(":id")
  @UseGuards(JwtGuard, AdministratorGuard)
  async delete(@Param("id") id: string) {
    return new UserDTO().from(await this.userService.delete(id));
  }
}
