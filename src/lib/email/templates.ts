import "server-only";

/** Clean HTML (navy / white, matching the app) plus a plain-text fallback. */

export function appUrl(path = ""): string {
  const base = (process.env.APP_URL?.trim() || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path}`;
}

export interface EmailContent {
  /** Short line shown in inbox previews. */
  preheader?: string;
  heading: string;
  /** Paragraphs under the heading. */
  paragraphs?: string[];
  /** Label / value rows (ticket details). */
  rows?: [string, string][];
  /** Highlighted quote (staff note, AI brief...). */
  quote?: { label: string; text: string };
  button?: { label: string; url: string };
  footer?: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const multiline = (s: string) => esc(s).replace(/\n/g, "<br>");

export function renderEmail(c: EmailContent): { html: string; text: string } {
  const paragraphs = (c.paragraphs ?? [])
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#334155">${multiline(p)}</p>`)
    .join("");
  const rows = c.rows?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:6px 0 18px;border-collapse:collapse">${c.rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;width:36%;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b;vertical-align:top">${esc(k)}</td><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;font-weight:600;color:#0f172a">${multiline(v)}</td></tr>`,
        )
        .join("")}</table>`
    : "";
  const quote = c.quote
    ? `<div style="margin:6px 0 18px;padding:14px 16px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:12px"><div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1d4ed8;margin-bottom:6px">${esc(c.quote.label)}</div><div style="font-size:14px;line-height:1.55;color:#0f172a">${multiline(c.quote.text)}</div></div>`
    : "";
  const button = c.button
    ? `<p style="margin:22px 0 6px"><a href="${esc(c.button.url)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:999px">${esc(c.button.label)}</a></p>`
    : "";
  const footer = c.footer ?? "You are receiving this because you use CampusConnect.";

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.heading)}</title></head><body style="margin:0;padding:0;background:#f8fafc;font-family:Manrope,Arial,Helvetica,sans-serif">${
    c.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(c.preheader)}</div>` : ""
  }<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px"><tr><td style="background:#0f172a;border-radius:24px 24px 0 0;padding:20px 28px"><span style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-.01em">CampusConnect</span></td></tr><tr><td style="background:#ffffff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 24px 24px;padding:28px"><h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;color:#0f172a;font-weight:800">${esc(c.heading)}</h1>${paragraphs}${rows}${quote}${button}</td></tr><tr><td style="padding:16px 8px;text-align:center;font-size:12px;color:#94a3b8">${esc(footer)}</td></tr></table></td></tr></table></body></html>`;

  const text = [
    c.heading,
    "",
    ...(c.paragraphs ?? []).flatMap((p) => [p, ""]),
    ...(c.rows ?? []).map(([k, v]) => `${k}: ${v}`),
    ...(c.rows?.length ? [""] : []),
    ...(c.quote ? [`${c.quote.label}: ${c.quote.text}`, ""] : []),
    ...(c.button ? [`${c.button.label}: ${c.button.url}`, ""] : []),
    footer,
  ].join("\n");

  return { html, text };
}
