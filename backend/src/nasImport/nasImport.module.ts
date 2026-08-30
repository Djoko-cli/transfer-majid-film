import { Module } from "@nestjs/common";
import { NasImportAdminController } from "./nasImportAdmin.controller";
import { NasImportShareController } from "./nasImportShare.controller";
import { NasImportService } from "./nasImport.service";

@Module({
  controllers: [NasImportAdminController, NasImportShareController],
  providers: [NasImportService],
})
export class NasImportModule {}
