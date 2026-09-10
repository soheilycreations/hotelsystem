/**
 * Renders an off-screen HTML element to a multi-page A4 PDF by rasterizing
 * it with html2canvas, instead of jsPDF's own text() drawing.
 *
 * jsPDF maps each character straight to a glyph with no OpenType shaping —
 * fine for Latin text, but Sinhala needs real text shaping (vowel signs
 * reordered around consonants, conjuncts formed via GSUB) or it comes out
 * as visibly broken glyph soup. The browser already shapes Sinhala
 * correctly for on-screen rendering, so reports in Sinhala are built as
 * plain HTML and captured as an image instead of drawn as vector text.
 */
export async function renderHtmlToPdf(el: HTMLElement): Promise<Blob> {
  const { default: html2canvas } = await import("html2canvas");
  const { jsPDF } = await import("jspdf");

  const canvas = await html2canvas(el, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
  });

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidthMm = 210;
  const pageHeightMm = 297;
  const pxPerMm = canvas.width / pageWidthMm;
  const pageHeightPx = pageHeightMm * pxPerMm;

  let renderedPx = 0;
  let first = true;
  while (renderedPx < canvas.height) {
    const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeightPx;
    const ctx = pageCanvas.getContext("2d");
    if (!ctx) break;
    ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);
    const imgData = pageCanvas.toDataURL("image/png");
    if (!first) doc.addPage();
    doc.addImage(imgData, "PNG", 0, 0, pageWidthMm, sliceHeightPx / pxPerMm);
    renderedPx += sliceHeightPx;
    first = false;
  }

  return doc.output("blob");
}

/**
 * Builds a hidden container sized to A4 width, appends it to the document
 * (html2canvas needs the element actually laid out to measure/paint it),
 * lets `build` fill it with markup, rasterizes it to a PDF, then removes it.
 */
export async function exportHtmlReport(build: (root: HTMLElement) => void): Promise<Blob> {
  const root = document.createElement("div");
  root.style.position = "fixed";
  root.style.left = "-10000px";
  root.style.top = "0";
  root.style.width = "794px"; // A4 width at 96dpi
  root.style.background = "#ffffff";
  document.body.appendChild(root);
  try {
    build(root);
    // Wait a frame so the embedded @font-face has a chance to apply before
    // the canvas snapshot — otherwise the first export can capture a
    // fallback-font flash instead of the Sinhala glyphs.
    await document.fonts.ready;
    return await renderHtmlToPdf(root);
  } finally {
    document.body.removeChild(root);
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
