import { Body, Controller, HttpCode, Post, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Response } from "express";
import { RequestCodeDTO } from "./dto/requestCode.dto";
import { VerifyCodeDTO } from "./dto/verifyCode.dto";
import { VerificationService } from "./verification.service";

@Controller("verification")
export class VerificationController {
  constructor(private verificationService: VerificationService) {}

  @Post("request-code")
  @HttpCode(202)
  @Throttle({
    default: {
      limit: 20,
      ttl: 5 * 60 * 1000,
    },
  })
  async requestCode(@Body() dto: RequestCodeDTO) {
    await this.verificationService.requestCode(dto.email);
  }

  @Post("verify-code")
  @HttpCode(200)
  @Throttle({
    default: {
      limit: 20,
      ttl: 5 * 60 * 1000,
    },
  })
  async verifyCode(
    @Body() dto: VerifyCodeDTO,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = await this.verificationService.verifyCode(
      dto.email,
      dto.code,
    );
    this.verificationService.setVerificationCookie(response, token);
  }
}
