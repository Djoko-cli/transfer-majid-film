import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { SendContactMessageDTO } from "./dto/sendContactMessage.dto";
import { ContactService } from "./contact.service";

@Controller("contact")
export class ContactController {
  constructor(private contactService: ContactService) {}

  @Post()
  @HttpCode(202)
  // Stricter than this app's other public, unauthenticated POST routes
  // (verification/resetPassword both use 20/5min) — those are gated by
  // needing a real registered email to do anything useful with; this one
  // isn't gated by anything but the honeypot below, so it's the more
  // spam-exposed surface of the two.
  @Throttle({
    default: {
      limit: 5,
      ttl: 10 * 60 * 1000,
    },
  })
  async sendMessage(@Body() dto: SendContactMessageDTO) {
    // See SendContactMessageDTO.website's own comment — silently pretend
    // this succeeded rather than telling a bot its honeypot field mattered.
    if (dto.website) return;

    await this.contactService.sendMessage(
      dto.subject,
      dto.message,
      dto.replyTo,
    );
  }
}
