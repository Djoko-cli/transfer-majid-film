import { Module } from "@nestjs/common";
import { FileModule } from "src/file/file.module";
import { NasImportAdminController } from "./nasImportAdmin.controller";
import { NasImportShareController } from "./nasImportShare.controller";
import { NasImportService } from "./nasImport.service";

@Module({
  imports: [FileModule],
  controllers: [NasImportAdminController, NasImportShareController],
  providers: [NasImportService],
})
export class NasImportModule {}
