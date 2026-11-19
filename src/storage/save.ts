export type SaveTarget =
  | { kind: "file-system"; writable: FileSystemWritableFileStream }
  | { kind: "download"; name: string };

/** Call immediately from the user's click, before long-running async work. */
export async function prepareSaveTarget(
  suggestedName: string,
  mime: string,
  extension: string
): Promise<SaveTarget> {
  const fileWindow = window as Window & {
    showSaveFilePicker?: (options: unknown) => Promise<FileSystemFileHandle>;
  };

  if (!fileWindow.showSaveFilePicker) return { kind: "download", name: suggestedName };

  const handle = await fileWindow.showSaveFilePicker({
    suggestedName,
    types: [{ description: `${extension.toUpperCase()} file`, accept: { [mime]: [`.${extension}`] } }]
  });
  return { kind: "file-system", writable: await handle.createWritable() };
}

/** Streams the Blob into the destination instead of calling arrayBuffer(). */
export async function writeSaveTarget(target: SaveTarget, blob: Blob): Promise<"saved" | "downloaded"> {
  if (target.kind === "file-system") {
    await blob.stream().pipeTo(target.writable);
    return "saved";
  }

  // Fallback browsers don't expose a writable file stream. The browser manages
  // the download; this path may need more memory for very large Blob outputs.
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = target.name;
  anchor.className = "download-anchor";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded";
}

export async function abortSaveTarget(target: SaveTarget | null) {
  if (target?.kind === "file-system") {
    try { await target.writable.abort(); } catch { /* already closed */ }
  }
}
