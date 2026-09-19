import { APP_NAME } from "@/lib/app";

/**
 * Email markup.
 *
 * Tables and inline styles, because mail clients strip <style> blocks and
 * mostly predate flexbox. Deliberately plain: no images, no web fonts, no
 * tracking pixel — it has to look right in Gmail, Outlook and a phone's
 * default client, and a household bill notice does not need decoration.
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
          <td style="padding:6px 0;color:${MUTED};font-size:14px;">${escapeHtml(label)}</td>
          <td style="padding:6px 0;color:${INK};font-size:14px;font-weight:500;text-align:right;white-space:nowrap;">${escapeHtml(
            value,
          )}</td>
        </tr>`,
    )
    .join("");

  const button = options.button
    ? `
      <tr><td style="padding-top:20px;">
        <a href="${escapeHtml(options.button.url)}"
           style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;
                  padding:10px 18px;border-radius:6px;font-size:14px;font-weight:500;">
          ${escapeHtml(options.button.label)}
        </a>
      </td></tr>`
    : "";

  const footnote = options.footnote
    ? `<p style="margin:16px 0 0;color:${SUBTLE};font-size:12px;line-height:1.5;">${escapeHtml(
        options.footnote,
      )}</p>`
    : "";

  return `<!doctype html>
<html lang="en-AU">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px 12px;background:${PAPER};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"
         style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid ${LINE};border-radius:8px;">
    <tr><td style="padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <p style="margin:0 0 4px;color:${SUBTLE};font-size:11px;letter-spacing:0.12em;text-transform:uppercase;">
        ${escapeHtml(APP_NAME)}
      </p>
      <h1 style="margin:0 0 10px;color:${INK};font-size:18px;font-weight:600;line-height:1.3;">
        ${escapeHtml(options.heading)}
      </h1>
      <p style="margin:0;color:${MUTED};font-size:14px;line-height:1.6;">
        ${escapeHtml(options.intro)}
      </p>

      ${
        rows
          ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"
                    style="width:100%;margin-top:16px;border-top:1px solid ${LINE};">
               ${rows}
             </table>`
          : ""
      }

      <table role="presentation" cellpadding="0" cellspacing="0" border="0">${button}</table>

      ${footnote}

      <p style="margin:20px 0 0;padding-top:16px;border-top:1px solid ${LINE};
                color:${SUBTLE};font-size:12px;line-height:1.5;">
        Sent by ${escapeHtml(APP_NAME)}, your household's bill tracker.
        This address is not monitored, so please do not reply.
      </p>
    </td></tr>
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
