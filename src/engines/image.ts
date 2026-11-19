import type { Converter } from "../types";

/** Native browser image path. AVIF encoding is not consistently available. */
export const imageConverter: Converter = {
  id: "native-image",
  label: "Browser image encoder",
  canConvert: (input, output) =>
    (input.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(input.name)) &&
    ["png","jpeg","webp"].includes(output.id),
  async convert(input, output, onProgress) {
    onProgress(0.05, "Decoding image");
    const bitmap = await createImageBitmap(input);
    try {
      const pixels = bitmap.width * bitmap.height;
      if (pixels > 16_000_000) throw new Error("This image exceeds the 16-megapixel safety limit.");
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("2D canvas is unavailable in this browser.");
      if (output.id === "jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, bitmap.width, bitmap.height);
      }
      context.drawImage(bitmap, 0, 0);
      onProgress(0.7, "Encoding output");
      const blob = await canvas.convertToBlob({
        type: output.mime,
        quality: output.id === "jpeg" || output.id === "webp" ? 0.9 : undefined
      });
      if (blob.type !== output.mime) {
        throw new Error(`This browser cannot encode ${output.label}. Try PNG, JPEG, or WebP.`);
      }
      onProgress(1, "Image ready");
      return blob;
    } finally {
      bitmap.close();
    }
  }
};
