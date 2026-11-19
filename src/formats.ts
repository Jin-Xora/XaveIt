import type { OutputFormat } from "./types";

export const formats: OutputFormat[] = [
  { id:"png", label:"PNG image", extension:"png", mime:"image/png", category:"image" },
  { id:"jpeg", label:"JPEG image", extension:"jpg", mime:"image/jpeg", category:"image" },
  { id:"webp", label:"WebP image", extension:"webp", mime:"image/webp", category:"image" },
  { id:"pdf", label:"PDF document (from TXT / Markdown)", extension:"pdf", mime:"application/pdf", category:"document" },
  { id:"zip", label:"ZIP archive (single file)", extension:"zip", mime:"application/zip", category:"archive" }
];

export const LIMITS = {
  image: 25 * 1024 * 1024,
  archive: 100 * 1024 * 1024,
  textPdf: 10 * 1024 * 1024
} as const;

export function supportedOutputs(file: File): OutputFormat[] {
  const isImage = /^(image\/(png|jpeg|webp|gif|bmp|avif))$/i.test(file.type) || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name);
  const isText = file.type.startsWith("text/") || /\.(txt|md|csv|log)$/i.test(file.name);
  return formats.filter(format => {
    if (format.id === "zip") return file.size <= LIMITS.archive;
    if (["png", "jpeg", "webp"].includes(format.id)) return isImage && file.size <= LIMITS.image;
    if (format.id === "pdf") return isText && file.size <= LIMITS.textPdf;
    return false;
  });
}
