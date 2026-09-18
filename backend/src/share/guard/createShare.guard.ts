import { ExecutionContext, Injectable } from "@nestjs/common";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { ConfigService } from "src/config/config.service";
import { VerificationService } from "src/verification/verification.service";

@Injectable()
export class CreateShareGuard extends JwtGuard {
  constructor(
    private configService: ConfigService,
    private verificationService: VerificationService,
  ) {
    super(configService);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const passed = await super.canActivate(context);
    if (passed && request.user) return true; // real authenticated user

    if (!passed) return false; // allowUnauthenticatedShares is off

    if (
      !this.configService.get(
        "share.requireEmailVerificationForAnonymousShares",
      )
    )
      return true;

    return this.verificationService.isRequestVerified(request);
  }
}
