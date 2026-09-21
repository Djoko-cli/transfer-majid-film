import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { Request, Response } from "express";
import { IdValidation } from "src/share/guard/shareIdValidation.guard";
import { ShareSecurityGuard } from "src/share/guard/shareSecurity.guard";
import { VerificationService } from "src/verification/verification.service";
import { ConfirmSessionDTO } from "./dto/confirmSession.dto";
import { PaymentService } from "./payment.service";

@Controller("shares/:shareId/payment")
export class PaymentController {
  constructor(
    private paymentService: PaymentService,
    private verification: VerificationService,
  ) {}

  @Post("session")
  // Pas de @RequiresPayment() ici : cette route N'EST PAS ce qu'elle protège,
  // elle y mène. ShareSecurityGuard vérifie donc expiration, restriction,
  // mot de passe et jeton — tout ce qui dirait qu'on ne peut pas livrer le
  // transfert — mais pas le paiement lui-même. Sans ce garde, un visiteur
  // pourrait payer un transfert qu'il ne pourra jamais ouvrir, et le seul
  // recours serait un remboursement à la main : on n'encaisse pas pour ce
  // qu'on ne peut pas livrer.
  @UseGuards(IdValidation, ShareSecurityGuard)
  async createSession(
    @Param("shareId") shareId: string,
    @Req() request: Request,
  ) {
    return this.paymentService.createSession(
      shareId,
      this.verification.getVerifiedEmail(request),
    );
  }

  @Post("confirm")
  // Volontairement SANS ShareSecurityGuard, à l'inverse de /session — et pour
  // la raison exactement inverse. /session mène au paiement : refuser un
  // transfert qu'on ne pourra pas livrer y évite d'encaisser pour rien. Ici
  // l'argent est DÉJÀ parti, et le garde refuserait précisément les deux cas
  // où cette route sert le plus : un transfert expiré pendant le passage en
  // caisse — le cas même pour lequel la fenêtre garantie existe — et un retour
  // depuis un autre navigateur, sans jeton de transfert. Le client verrait un
  // 404 ou un 403 après avoir payé.
  //
  // Elle n'est pas abusable pour autant : l'adresse enregistrée vient de
  // `session.customer_details.email` tel que Stripe le rapporte, jamais de
  // l'appelant, et `metadata.shareId` doit désigner ce transfert. Poster
  // l'identifiant de session d'un autre acheteur n'ouvre donc rien à
  // l'appelant — cela enregistre le paiement de cet autre acheteur, ce que le
  // webhook ferait de toute façon.
  @UseGuards(IdValidation)
  async confirm(
    @Param("shareId") shareId: string,
    @Body() { sessionId }: ConfirmSessionDTO,
    // `passthrough` parce qu'on pose un cookie tout en laissant Nest
    // sérialiser la valeur rendue, comme le fait verification.controller.ts.
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.paymentService.confirmSession(shareId, sessionId, response);
  }
}
