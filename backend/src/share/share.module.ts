import { forwardRef, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ClamScanModule } from "src/clamscan/clamscan.module";
import { EmailModule } from "src/email/email.module";
import { FileModule } from "src/file/file.module";
import { SystemModule } from "src/system/system.module";
import { VerificationModule } from "src/verification/verification.module";
import { ContributionController } from "./contribution.controller";
import { ContributionService } from "./contribution.service";
import { ShareController } from "./share.controller";
import { ShareService } from "./share.service";

@Module({
  imports: [
    JwtModule.register({}),
    EmailModule,
    forwardRef(() => ClamScanModule),
    forwardRef(() => FileModule),
    SystemModule,
    VerificationModule,
  ],
  controllers: [ShareController, ContributionController],
  providers: [ShareService, ContributionService],
  exports: [ShareService],
})
export class ShareModule {}
