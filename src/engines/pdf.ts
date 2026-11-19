import type { Converter } from "../types";

/** Plain-text PDF export with a built-in Helvetica font; not a DOCX renderer. */
export const textToPdfConverter: Converter = {
  id: "text-to-pdf",
  label: "Text to PDF",
  canConvert: (input, output) => output.id === "pdf" &&
    (input.type.startsWith("text/") || /\.(txt|md|csv|log)$/i.test(input.name)),
  async convert(input, _output, onProgress) {
    onProgress(0.1, "Reading text locally");
    const source = await input.text();
    const lines = source.split(/\r?\n/).flatMap(line => wrapLine(line, 92));
    const perPage = 48;
    const pages: string[][] = [];
    for (let i = 0; i < lines.length || i === 0; i += perPage) pages.push(lines.slice(i, i + perPage));
    const objects: string[] = [];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    const pageRefs = pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
    objects[2] = `<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`;
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

    pages.forEach((pageLines, i) => {
      const pageId = 4 + i * 2;
      const contentId = pageId + 1;
      const textOps = pageLines.map((line, j) => `${j === 0 ? "" : "0 -14 Td "}(${pdfEscape(toWinAnsiSafe(line))}) Tj`).join("\n");
      const stream = `BT\n/F1 10 Tf\n48 760 Td\n${textOps}\nET`;
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId] = `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`;
      onProgress(0.2 + ((i + 1) / pages.length) * 0.65, "Laying out PDF pages");
    });

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (let id = 1; id < objects.length; id++) {
      offsets[id] = pdf.length;
      pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id++) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    onProgress(1, "PDF ready");
    return new Blob([new TextEncoder().encode(pdf)], { type: "application/pdf" });
  }
};

function wrapLine(line: string, max: number) {
  if (!line) return [""];
  const words = line.split(/\s+/);
  const result: string[] = [];
  let current = "";
  for (const rawWord of words) {
    const parts = rawWord.match(new RegExp(`.{1,${max}}`, "g")) || [""];
    for (const word of parts) {
      if (!current) current = word;
      else if ((current + " " + word).length <= max) current += " " + word;
      else { result.push(current); current = word; }
    }
  }
  if (current) result.push(current);
  return result;
}
function toWinAnsiSafe(value: string) {
  return value.replace(/[^\x20-\x7e]/g, "?");
}
function pdfEscape(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
