export const MAX_INPUT_BYTES = 500 * 1024 * 1024; // 500 MiB

export async function checkLocalCapacity(fileSize: number) {
  if (fileSize > MAX_INPUT_BYTES) {
    throw new Error("This V1 supports input files up to 500 MB.");
  }
  if (!("storage" in navigator) || !navigator.storage.getDirectory) {
    // Small files can still use the in-memory fallback; large files should not.
    if (fileSize > 50 * 1024 * 1024) {
      throw new Error("This browser does not support OPFS. Use a current Chromium-based browser for files above 50 MB.");
    }
    return { opfsAvailable: false, quota: null as number | null, usage: null as number | null };
  }

  const estimate = await navigator.storage.estimate();
  const quota = estimate.quota ?? 0;
  const usage = estimate.usage ?? 0;
  const available = Math.max(0, quota - usage);
  // Leave 15% headroom and account for staging the input. Conversion engines
  // may need additional working space, so this is a preflight, not a guarantee.
  const required = Math.ceil(fileSize * 1.15);
  if (available && available < required) {
    throw new Error(`Not enough browser storage. Approximately ${Math.ceil(required / 1024 / 1024)} MB is required for staging; ${Math.floor(available / 1024 / 1024)} MB is estimated available.`);
  }
  return { opfsAvailable: true, quota, usage };
}

/** Stream the selected input into a temporary OPFS file in bounded chunks. */
export async function stageInOPFS(file: File, onProgress: (ratio: number) => void) {
  if (!("storage" in navigator) || !navigator.storage.getDirectory) {
    return { kind: "memory" as const, file };
  }
  const root = await navigator.storage.getDirectory();
  const name = `input-${crypto.randomUUID()}.bin`;
  const handle = await root.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  const reader = file.stream().getReader();
  let written = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      await writable.write(value);
      written += value.byteLength;
      onProgress(written / Math.max(file.size, 1));
    }
    await writable.close();
    return {
      kind: "opfs" as const,
      name,
      read: () => handle.getFile(),
      cleanup: async () => { try { await root.removeEntry(name); } catch { /* already removed */ } }
    };
  } catch (error) {
    try { await writable.abort(); } catch { /* ignore abort failure */ }
    try { await root.removeEntry(name); } catch { /* ignore cleanup failure */ }
    throw error;
  } finally {
    reader.releaseLock();
  }
}
