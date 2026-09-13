// Pure HTML rendering — no DI, no I/O. The one place every outgoing email's
// visual shell is defined; EmailService.sendMail() is the only caller.
//
// Deliberately skips full Outlook/VML table-soup and a dark-mode variant:
// this is a small personal/family deployment, not a mass-market send, and
// recipients are near-certainly on modern webmail or mobile clients. One
// outer table is kept for the one thing worth the ceremony — reliable
// centering and a max-width across clients that ignore max-width on a bare
// div (old Outlook chief among them).
//
// Share-related emails (recipient notification, sender confirmation) use
// the headline/metaLine/files/downloadUrl fields below — modeled directly
// on WeTransfer's own confirmation emails (headline stating what happened,
// a byline with count/size/expiry, the link shown as real text as well as
// a button, a plain file list) rather than a generic "Bonjour, here's a
// link" paragraph.

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
  /** Rendered as a prominent button — the recipient's primary action (download). Omit for a confirmation email with no urgent action, e.g. the sender's own copy. */
  ctaUrl?: string;
  ctaLabel?: string;
  /** Large statement at the top of the card, e.g. "Alice sent you 3 files" — replaces a "Hello!" opener. */
  headline?: string;
  /** Small byline under the headline, e.g. "3 items, 45.2 MB total · Expires Sep 2, 2026". */
  metaLine?: string;
  /** Shown as real clickable text under a "Download link" label — present on both the recipient and sender-side emails, independent of whether ctaUrl also renders a button. */
  downloadUrl?: string;
  downloadUrlLabel?: string;
  /** The transfer's contents, shown as a plain name/size list under a "N item(s)" label. */
  files?: { name: string; size: string }[];
  filesLabel?: string;
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
// EmailService (e.g. "{creator} ({creatorEmail}) a partagé...\n\nNote : {desc}").
const renderParagraphs = (text: string): string =>
  text
    .split(/\n{2,}/)
    .map((paragraph) => escapeHtml(paragraph).replace(/\n/g, "<br>"))
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => `<p style="margin:0 0 16px;">${paragraph}</p>`)
    .join("");

const sectionLabel = (text: string) =>
  `<p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.02em;color:${DIMMED_HEX};text-transform:uppercase;">${escapeHtml(
    text,
  )}</p>`;

export function renderEmailEnvelope(options: EmailEnvelopeOptions): string {
  const {
    appName,
    appUrl,
    logoUrl,
    bodyText,
    code,
    ctaUrl,
    ctaLabel,
    headline,
    metaLine,
    downloadUrl,
    downloadUrlLabel,
    files,
    filesLabel,
  } = options;

  // Dropped entirely when there is nothing to say, rather than left as an
  // empty cell. renderParagraphs already returns "" for a blank body, but
  // the cell around it still contained the template's own indentation —
  // one whitespace text node, which at line-height 1.6 renders as a stray
  // blank line between the headline and the button.
  const paragraphs = renderParagraphs(bodyText);
  const bodyBlock = paragraphs
    ? `<tr><td style="font-size:15px;line-height:1.6;color:${TEXT_HEX};">${paragraphs}</td></tr>`
    : "";

  const headlineBlock = headline
    ? `<p style="margin:0 0 4px;font-size:22px;font-weight:700;line-height:1.3;color:${TEXT_HEX};">${escapeHtml(
        headline,
      )}</p>`
    : "";

  const metaBlock = metaLine
    ? `<p style="margin:0 0 20px;font-size:13px;color:${DIMMED_HEX};">${escapeHtml(
        metaLine,
      )}</p>`
    : "";

  const codeBlock = code
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
        <tr><td style="background:${BG_HEX};border:1px solid ${BORDER_HEX};border-radius:10px;padding:16px 28px;">
          <span style="font-family:'SF Mono',Consolas,'Courier New',monospace;font-size:28px;font-weight:700;letter-spacing:8px;color:${TEXT_HEX};">${escapeHtml(
            code,
          )}</span>
        </td></tr>
      </table>`
    : "";

  const ctaBlock =
    ctaUrl && ctaLabel
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
        <tr><td style="background:${ACCENT_HEX};border-radius:8px;">
          <a href="${escapeHtml(
            ctaUrl,
          )}" style="display:inline-block;padding:12px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(
            ctaLabel,
          )}</a>
        </td></tr>
      </table>`
      : "";

  const hasTransferDetails = !!downloadUrl || !!files?.length;
  const divider = hasTransferDetails
    ? `<tr><td style="padding:8px 0 20px;"><div style="border-top:1px solid ${BORDER_HEX};"></div></td></tr>`
    : "";

  const downloadLinkBlock = downloadUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
        <tr><td>
          ${sectionLabel(downloadUrlLabel || "")}
          <a href="${escapeHtml(
            downloadUrl,
          )}" style="font-size:14px;color:${ACCENT_HEX};word-break:break-all;">${escapeHtml(
            downloadUrl,
          )}</a>
        </td></tr>
      </table>`
    : "";

  const filesBlock = files?.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px;">
        <tr><td>${sectionLabel(filesLabel || "")}</td></tr>
        ${files
          .map(
            (
              file,
            ) => `<tr><td style="padding:8px 0;border-top:1px solid ${BORDER_HEX};">
              <p style="margin:0;font-size:14px;color:${TEXT_HEX};">${escapeHtml(file.name)}</p>
              <p style="margin:2px 0 0;font-size:12px;color:${DIMMED_HEX};">${escapeHtml(file.size)}</p>
            </td></tr>`,
          )
          .join("")}
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
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr><td>${headlineBlock}${metaBlock}</td></tr>
                  ${bodyBlock}
                  <tr><td>${codeBlock}</td></tr>
                  <tr><td>${ctaBlock}</td></tr>
                  ${divider}
                  <tr><td>${downloadLinkBlock}</td></tr>
                  <tr><td>${filesBlock}</td></tr>
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
