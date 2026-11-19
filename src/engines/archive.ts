import type { Converter } from "../types";

/** Creates a standards-compliant, single-entry ZIP using STORE (no compression).
 * Input is read in bounded chunks; the final ZIP Blob retains output chunks. */
export const archiveConverter: Converter = {
  id: "zip",
  label: "ZIP archive",
  canConvert: (_input, output) => output.id === "zip",
  async convert(input, _output, onProgress) {
    const name = new TextEncoder().encode(safeFilename(input.name));
    const chunks: BlobPart[] = [];
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0808, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true); lv.setUint16(12, 0, true);
    lv.setUint32(14, 0, true); lv.setUint32(18, input.size, true); lv.setUint32(22, input.size, true);
    lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
    local.set(name, 30);
    chunks.push(local);

    let crc = 0xffffffff;
    let read = 0;
    const reader = input.stream().getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        crc = updateCrc32(crc, value);
        chunks.push(value.slice().buffer as ArrayBuffer);
        read += value.byteLength;
        onProgress(read / Math.max(input.size, 1) * 0.9, "Adding file to ZIP archive");
      }
    } finally {
      reader.releaseLock();
    }
    crc = (crc ^ 0xffffffff) >>> 0;

    const descriptor = new Uint8Array(16);
    const dv = new DataView(descriptor.buffer);
    dv.setUint32(0, 0x08074b50, true); dv.setUint32(4, crc, true);
    dv.setUint32(8, input.size, true); dv.setUint32(12, input.size, true);
    chunks.push(descriptor);

    const centralOffset = 30 + name.length + input.size + descriptor.length;
    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0808, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true); cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, input.size, true); cv.setUint32(24, input.size, true);
    cv.setUint16(28, name.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, 0, true); cv.setUint32(42, 0, true);
    central.set(name, 46);
    chunks.push(central);

    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
    ev.setUint16(8, 1, true); ev.setUint16(10, 1, true);
    ev.setUint32(12, central.length, true); ev.setUint32(16, centralOffset, true); ev.setUint16(20, 0, true);
    chunks.push(end);
    onProgress(1, "ZIP archive ready");
    return new Blob(chunks, { type: "application/zip" });
  }
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
function updateCrc32(crc: number, bytes: Uint8Array) {
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return crc >>> 0;
}
function safeFilename(name: string) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 180) || "file";
}
