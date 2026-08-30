import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { AdministratorGuard } from "src/auth/guard/isAdmin.guard";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { NasBrowseDTO } from "./dto/nasBrowse.dto";
import { NasImportPathsDTO } from "./dto/nasImportPaths.dto";
import { NasImportService } from "./nasImport.service";

// Browsing and previewing aren't scoped to any one share — an admin picks
// content first, the share it becomes is only created afterward — so
// these live under their own admin-only prefix rather than shares/:shareId
// like the commit endpoint in nasImportShare.controller.ts.
@Controller("admin/nas-import")
@UseGuards(JwtGuard, AdministratorGuard)
export class NasImportAdminController {
  constructor(private nasImportService: NasImportService) {}

  @Get("browse")
  async browse(@Query() query: NasBrowseDTO) {
    return this.nasImportService.browse(query.path || "");
  }

  @Post("preview")
  async preview(@Body() body: NasImportPathsDTO) {
    return this.nasImportService.preview(body.paths);
  }
}
