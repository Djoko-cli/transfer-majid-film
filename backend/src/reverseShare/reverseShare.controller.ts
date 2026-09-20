import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { User } from "@prisma/client";
import { GetUser } from "src/auth/decorator/getUser.decorator";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { ConfigService } from "src/config/config.service";
import { CreateReverseShareDTO } from "./dto/createReverseShare.dto";
import { ReverseShareDTO } from "./dto/reverseShare.dto";
import { ReverseShareOwnerGuard } from "./guards/reverseShareOwner.guard";
import { ReverseShareService } from "./reverseShare.service";

@Controller("reverseShares")
export class ReverseShareController {
  constructor(
    private reverseShareService: ReverseShareService,
    private config: ConfigService,
  ) {}

  @UseGuards(JwtGuard)
  @Throttle({
    default: {
      limit: 10,
      ttl: 60 * 1000,
    },
  })
  @Get("isReverseShareTokenAvailable/:token")
  async isReverseShareTokenAvailable(@Param("token") token: string) {
    return this.reverseShareService.isReverseShareTokenAvailable(token);
  }

  @Post()
  @UseGuards(JwtGuard)
  async create(@Body() body: CreateReverseShareDTO, @GetUser() user: User) {
    const token = await this.reverseShareService.create(body, user.id);

    const link = `${this.config.get("general.appUrl")}/s/${token}`;

    return { token, link };
  }

  @Get()
  @UseGuards(JwtGuard)
  async getAllByUser(@GetUser() user: User) {
    return new ReverseShareDTO().fromList(
      await this.reverseShareService.getAllByUser(user.id),
    );
  }

  @Delete(":reverseShareId")
  @UseGuards(JwtGuard, ReverseShareOwnerGuard)
  async remove(@Param("reverseShareId") id: string) {
    await this.reverseShareService.remove(id);
  }
}
