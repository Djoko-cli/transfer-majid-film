import { Module } from "@nestjs/common";
import { EmailModule } from "src/email/email.module";
import { FileModule } from "src/file/file.module";
import { ReverseShareModule } from "src/reverseShare/reverseShare.module";
import { JobsService } from "./jobs.service";
import { ConfigModule } from "../config/config.module";

@Module({
  imports: [FileModule, ReverseShareModule, ConfigModule, EmailModule],
  providers: [JobsService],
})
export class JobsModule {}
