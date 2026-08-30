// Pure HTML rendering — no DI, no I/O. The one place every outgoing email's
// visual shell is defined; EmailService.sendMail() is the only caller.
//
// Deliberately skips full Outlook/VML table-soup and a dark-mode variant:
// this is a small personal/family deployment, not a mass-market send, and
// recipients are near-certainly on modern webmail or mobile clients. One
// outer table is kept for the one thing worth the ceremony — reliable
// centering and a max-width across clients that ignore max-width on a bare
// div (old Outlook chief among them).

const ACCENT_HEX = "#ff7a00";
const TEXT_HEX = "#141414";
const DIMMED_HEX = "#6b6b6b";
const BORDER_HEX = "#e5e5e5";
const BG_HEX = "#f4f4f4";

export interface EmailEnvelopeOptions {
  appName: string;
  appUrl: string;
  logoUrl: string;
  /** Already placeholder-substituted, raw admin-authored text — escaped here. */
  bodyText: string;
  /** A verification code to render as a large, typeable badge above the body text. */
  code?: string;
  /** The email's one primary link, rendered as a button below the body text. */
  ctaUrl?: string;
  ctaLabel?: string;
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// \n\n+ (or more) starts a new paragraph; a lone \n inside one becomes <br>.
// Matches the admin-authored message convention used throughout
// EmailService (e.g. "Bonjour !\n\n{...}\n\nCe partage expirera {...}.").
const renderParagraphs = (text: string): string =>
  text
    .split(/\n{2,}/)
    .map((paragraph) => escapeHtml(paragraph).replace(/\n/g, "<br>"))
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p style="margin:0 0 16px;">${paragraph}</p>`)
    .join("");

export function renderEmailEnvelope(options: EmailEnvelopeOptions): string {
  const { appName, appUrl, logoUrl, bodyText, code, ctaUrl, ctaLabel } =
    options;

  const codeBlock = code
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
        <tr><td style="background:${BG_HEX};border:1px solid ${BORDER_HEX};border-radius:10px;padding:16px 28px;">
          <span style="font-family:'SF Mono',Consolas,'Courier New',monospace;font-size:28px;font-weight:700;letter-spacing:8px;color:${TEXT_HEX};">${escapeHtml(
            code,
          )}</span>
        </td></tr>
      </table>`
    : "";

  const ctaBlock = ctaUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
        <tr><td style="background:${ACCENT_HEX};border-radius:8px;">
          <a href="${escapeHtml(
            ctaUrl,
          )}" style="display:inline-block;padding:12px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(
            ctaLabel || "",
          )}</a>
        </td></tr>
      </table>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:${BG_HEX};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
            <tr>
              <td style="padding:0 0 24px;text-align:center;">
                <img src="${escapeHtml(
                  logoUrl,
                )}" alt="${escapeHtml(appName)}" height="28" style="height:28px;border:0;">
              </td>
            </tr>
            <tr>
              <td style="background:#ffffff;border:1px solid ${BORDER_HEX};border-radius:16px;padding:36px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr><td style="font-size:15px;line-height:1.6;color:${TEXT_HEX};">
                    ${renderParagraphs(bodyText)}
                  </td></tr>
                  <tr><td>${codeBlock}</td></tr>
                  <tr><td>${ctaBlock}</td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 8px 0;text-align:center;font-size:12px;color:${DIMMED_HEX};">
                <a href="${escapeHtml(
                  appUrl,
                )}" style="color:${DIMMED_HEX};text-decoration:none;font-weight:600;">${escapeHtml(
                  appName,
                )}</a>
                &nbsp;·&nbsp;
                <a href="https://majid.film" style="color:${DIMMED_HEX};text-decoration:none;">majid.film</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
