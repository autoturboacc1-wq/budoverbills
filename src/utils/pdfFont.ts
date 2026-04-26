import type { jsPDF } from "jspdf";

// Sarabun TTF files are shipped under public/fonts/ so the browser fetches them
// same-origin (no Google Fonts CDN, no CSP friction, works offline once cached).
// Both files come from cadsondemak/Sarabun (OFL-1.1) — see public/fonts/Sarabun-OFL.txt.
const SARABUN_REGULAR_URL = "/fonts/Sarabun-Regular.ttf";
const SARABUN_BOLD_URL = "/fonts/Sarabun-Bold.ttf";

export const PDF_FONT_FAMILY = "Sarabun";
export const PDF_FALLBACK_FAMILY = "helvetica";

let cachedRegular: Promise<string | null> | null = null;
let cachedBold: Promise<string | null> | null = null;

async function fetchAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) return null;

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    // Chunked to avoid stack overflow on large fonts in some engines.
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    return btoa(binary);
  } catch {
    return null;
  }
}

function getRegularFont(): Promise<string | null> {
  if (!cachedRegular) cachedRegular = fetchAsBase64(SARABUN_REGULAR_URL);
  return cachedRegular;
}

function getBoldFont(): Promise<string | null> {
  if (!cachedBold) cachedBold = fetchAsBase64(SARABUN_BOLD_URL);
  return cachedBold;
}

/**
 * Registers Sarabun (regular + bold) into a jsPDF document. Returns the font
 * family name to pass to `doc.setFont()`. Falls back to Helvetica if both
 * fetches fail — Thai glyphs will render as boxes in that case, but at least
 * the PDF is produced.
 */
export async function registerThaiFont(doc: jsPDF): Promise<string> {
  const [regularB64, boldB64] = await Promise.all([getRegularFont(), getBoldFont()]);

  if (!regularB64) {
    return PDF_FALLBACK_FAMILY;
  }

  doc.addFileToVFS("Sarabun-Regular.ttf", regularB64);
  doc.addFont("Sarabun-Regular.ttf", PDF_FONT_FAMILY, "normal");

  if (boldB64) {
    doc.addFileToVFS("Sarabun-Bold.ttf", boldB64);
    doc.addFont("Sarabun-Bold.ttf", PDF_FONT_FAMILY, "bold");
  }

  return PDF_FONT_FAMILY;
}

/**
 * Ensures the Sarabun web font is loaded into the DOM before html2canvas
 * captures any element styled with it. Without this, html2canvas may snapshot
 * the page while the font is still swapping, producing boxes for Thai glyphs.
 */
export async function waitForSarabunFontReady(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load(`12px "${PDF_FONT_FAMILY}"`),
      document.fonts.load(`bold 12px "${PDF_FONT_FAMILY}"`),
    ]);
    await document.fonts.ready;
  } catch {
    // Best-effort: if FontFaceSet rejects, html2canvas will still try with whatever
    // is currently registered.
  }
}
