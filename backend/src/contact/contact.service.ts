import { Injectable } from "@nestjs/common";
import { EmailService } from "src/email/email.service";

@Injectable()
export class ContactService {
  constructor(private email: EmailService) {}

  // The honeypot check lives in the controller, not here — this method is
  // "actually send it", the controller decides whether to call it at all.
  async sendMessage(
    subject: string,
    message: string,
    replyTo?: string,
    ip?: string,
    userAgent?: string,
    referer?: string,
  ) {
    await this.email.sendContactMessage(
      subject,
      message,
      replyTo,
      ip,
      userAgent,
      referer,
    );
  }
}
