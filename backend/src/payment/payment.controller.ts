import { Controller, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { IdValidation } from "src/share/guard/shareIdValidation.guard";
import { ShareSecurityGuard } from "src/share/guard/shareSecurity.guard";
import { VerificationService } from "src/verification/verification.service";
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
}
