import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { EmailModule } from "src/email/email.module";
import { VerificationController } from "./verification.controller";
import { VerificationService } from "./verification.service";

@Module({
  imports: [JwtModule.register({}), EmailModule],
  controllers: [VerificationController],
  providers: [VerificationService],
  exports: [VerificationService],
})
export class VerificationModule {}
