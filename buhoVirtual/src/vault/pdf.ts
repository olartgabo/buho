// pdf-parse is CommonJS; default import works under esModuleInterop.
import pdf from "pdf-parse";

/**
 * Convert a PDF buffer to markdown.
 *
 * This uses pdf-parse, which extracts the text layer only — good for slides,
 * notes and text-based PDFs. It does NOT reconstruct tables, columns or math.
 * For high-fidelity conversion (tables/formulas), swap in a Docling /
 * PyMuPDF4LLM helper later; this keeps the project pure-Node and installable.
 */
export async function pdfBufferToMarkdown(buf: Buffer, title?: string): Promise<string> {
  const data = await pdf(buf);
  return textToMarkdown(data.text, title, data.numpages);
}

function textToMarkdown(raw: string, title?: string, pages?: number): string {
  // Normalise line endings and collapse runs of blank lines into paragraph breaks.
  const normalised = raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const header: string[] = [];
  if (title) header.push(`# ${title}`, "");
  if (pages) header.push(`> Extracted from a ${pages}-page PDF (text layer only).`, "");

  return [...header, normalised, ""].join("\n");
}
