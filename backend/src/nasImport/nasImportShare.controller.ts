import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { AdministratorGuard } from "src/auth/guard/isAdmin.guard";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { IdValidation } from "src/share/guard/shareIdValidation.guard";
import { StrictShareOwnerGuard } from "src/share/guard/strictShareOwner.guard";
import { NasImportCommitDTO } from "./dto/nasImportPaths.dto";
import { NasImportService } from "./nasImport.service";

// Deliberately AdministratorGuard, not CreateShareGuard (the guard the
// normal chunked-upload endpoint uses) — CreateShareGuard exists
// specifically to *permit* anonymous/reverse-share-token actors, the
// opposite of what an admin-only import needs. StrictShareOwnerGuard still
// applies on top, same as the upload endpoints — the admin must own the
// share they're importing into (true by construction: they just created it
// themselves via the normal POST /shares a moment earlier).
@Controller("shares/:shareId/nas-import")
@UseGuards(JwtGuard, AdministratorGuard, IdValidation, StrictShareOwnerGuard)
export class NasImportShareController {
  constructor(private nasImportService: NasImportService) {}

  @Post()
  async commit(
    @Param("shareId") shareId: string,
    @Body() body: NasImportCommitDTO,
  ) {
    return this.nasImportService.importBatch(shareId, body.paths, body.cursor);
  }
}
