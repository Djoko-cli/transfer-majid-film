import { Controller, Get, Res } from "@nestjs/common";
import { Response } from "express";
import { APP_VERSION } from "./constants";
import { PrismaService } from "./prisma/prisma.service";

@Controller("/")
export class AppController {
  constructor(private prismaService: PrismaService) {}

  @Get("health")
  async health(@Res({ passthrough: true }) res: Response) {
    try {
      await this.prismaService.config.findMany();
      return "OK";
    } catch {
      res.statusCode = 500;
      return "ERROR";
    }
  }

  @Get("version")
  version() {
    return { version: APP_VERSION };
  }
}
