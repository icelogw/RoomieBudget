import { APP_NAME } from "@/lib/app";

/**
 * Email markup.
 *
 * Tables and inline styles, because mail clients strip <style> blocks and
 * mostly predate flexbox. Deliberately plain: no images, no web fonts, no
 * tracking pixel — it has to look right in Gmail, Outlook and a phone's
 * default client, and a household bill notice does not need decoration.
 *
 * Two rules drive the odd-looking structure:
 *
 * Nothing is styled on <body>. Gmail and several webmail clients discard the
 * body element entirely and reparent its children, taking any background or
 * padding with it. The page background lives on a full-width table instead.
 *
 * Widths are HTML attributes as well as CSS. Outlook's Word rendering engine
 * ignores max-width, so a layout that relies on it alone stretches to the full
 * window there. A fixed `width` attribute on the inner table is what actually
 * holds the column at 520px.
 *
 * Alignment is likewise an attribute beside the CSS, for the same reason.
 *
 * Deliberately left as-is: border-radius and margin are only partly supported,
 * and both degrade harmlessly — square corners and slightly different spacing
 * in old Outlook is not worth contorting the markup for.
 *
 * Every message ships a plain-text alternative. Some clients show it, and a
 * message with no text part scores badly with spam filters.
 */

const INK = "#1a1815";
const MUTED = "#57514a";
const SUBTLE = "#8a8279";
const LINE = "#e4e0d9";
const PAPER = "#faf9f7";
const ACCENT = "#15504b";

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export type Button = { label: string; url: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function layout(options: {
  heading: string;
  intro: string;
  rows?: Array<{ label: string; value: string }>;
  button?: Button;
  footnote?: string;
}): string {
  const rows = (options.rows ?? [])
    .map(
      ({ label, value }) => `
              <tr>
                <td align="left" style="padding:6px 0;color:${MUTED};font-size:14px;font-family:${FONT};">${escapeHtml(
                  label,
                )}</td>
                <td align="right" style="padding:6px 0;color:${INK};font-size:14px;font-weight:bold;font-family:${FONT};text-align:right;">${escapeHtml(
                  value,
                )}</td>
              </tr>`,
    )
    .join("");

  const button = options.button
    ? `
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr><td align="left" style="padding-top:20px;">
                <a href="${escapeHtml(options.button.url)}"
                   style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;
                          padding:11px 18px;border-radius:6px;font-size:14px;font-weight:bold;font-family:${FONT};">
                  ${escapeHtml(options.button.label)}
                </a>
              </td></tr>
            </table>`
    : "";

  const footnote = options.footnote
    ? `<p style="margin:16px 0 0;color:${SUBTLE};font-size:12px;line-height:1.5;font-family:${FONT};">${escapeHtml(
        options.footnote,
      )}</p>`
    : "";

  return `<!doctype html>
<html lang="en-AU">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(options.heading)}</title>
</head>
<body>
  <!-- Page background sits here, not on <body>, which some clients discard. -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
         bgcolor="${PAPER}" style="background-color:${PAPER};width:100%;">
    <tr>
      <td align="center" style="padding:24px 12px;">

        <!-- width attribute as well as max-width: Outlook ignores max-width. -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520"
               bgcolor="#ffffff"
               style="width:520px;max-width:520px;background-color:#ffffff;border:1px solid ${LINE};border-radius:8px;">
          <tr>
            <td align="left" style="padding:24px;font-family:${FONT};">

              <p style="margin:0 0 4px;color:${SUBTLE};font-size:11px;letter-spacing:1px;text-transform:uppercase;font-family:${FONT};">
                ${escapeHtml(APP_NAME)}
              </p>
              <h1 style="margin:0 0 10px;color:${INK};font-size:18px;font-weight:bold;line-height:1.3;font-family:${FONT};">
                ${escapeHtml(options.heading)}
              </h1>
              <p style="margin:0;color:${MUTED};font-size:14px;line-height:1.6;font-family:${FONT};">
                ${escapeHtml(options.intro)}
              </p>

              ${
                rows
                  ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                            style="width:100%;margin-top:16px;border-top:1px solid ${LINE};">
                       ${rows}
                     </table>`
                  : ""
              }

              ${button}
              ${footnote}

              <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid ${LINE};
                        color:${SUBTLE};font-size:12px;line-height:1.5;font-family:${FONT};">
                Sent by ${escapeHtml(APP_NAME)}, your household's bill tracker.
                This address is not monitored, so please do not reply.
              </p>

            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** The same content as plain text, for clients that prefer it. */
export function plain(options: {
  heading: string;
  intro: string;
  rows?: Array<{ label: string; value: string }>;
  button?: Button;
  footnote?: string;
}): string {
  const parts = [options.heading, "", options.intro];

  if (options.rows?.length) {
    parts.push("");
    for (const row of options.rows) parts.push(`${row.label}: ${row.value}`);
  }

  if (options.button) {
    parts.push("", `${options.button.label}: ${options.button.url}`);
  }

  if (options.footnote) parts.push("", options.footnote);

  parts.push(
    "",
    "--",
    `Sent by ${APP_NAME}, your household's bill tracker.`,
    "This address is not monitored, so please do not reply.",
  );

  return parts.join("\n");
}
