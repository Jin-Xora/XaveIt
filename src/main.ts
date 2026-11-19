import "./style.css";
import { formats, supportedOutputs } from "./formats";
import { checkLocalCapacity, MAX_INPUT_BYTES, stageInOPFS } from "./storage/opfs";
import { abortSaveTarget, prepareSaveTarget, writeSaveTarget, type SaveTarget } from "./storage/save";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const dropzone = $("dropzone");
const fileInput = $("file-input") as HTMLInputElement;
const workspace = $("workspace");
const selectedFilePanel = $("selected-file");
const outputName = $("output-name") as HTMLInputElement;
const formatSelect = $("format") as HTMLSelectElement;
const convertButton = $("convert") as HTMLButtonElement;
const cancelButton = $("cancel") as HTMLButtonElement;
const status = $("status");
let selectedFile: File | null = null;
let activeWorker: Worker | null = null;
let cancelRequested = false;

function refreshFormats(file: File) {
  formatSelect.replaceChildren();
  const available = supportedOutputs(file);
  for (const format of available) {
    const option = document.createElement("option");
    option.value = format.id;
    option.textContent = format.label;
    formatSelect.append(option);
  }
  if (!available.length) {
    const option = document.createElement("option");
    option.textContent = "No supported output for this file";
    option.value = "";
    formatSelect.append(option);
  }
  formatSelect.disabled = !available.length;
  if (available.some(format => format.id === "webp")) formatSelect.value = "webp";
convertButton.disabled = true;
  convertButton.disabled = file.size > MAX_INPUT_BYTES || !available.length;
}

formatSelect.value = "webp";
convertButton.disabled = true;

function humanSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
function setFile(file: File) {
  selectedFile = file;
  $("file-name").textContent = file.name;
  outputName.value = file.name.replace(/\.[^/.]+$/, "") + "." + (supportedOutputs(file)[0]?.extension || "txt");
  selectedFilePanel.hidden = false;
  $("file-details").textContent = `${file.type || "Unknown type"} · ${humanSize(file.size)} · 500 MiB input limit`;
  workspace.hidden = false;
  refreshFormats(file);
  status.textContent = file.size > MAX_INPUT_BYTES
    ? "This file exceeds the 500 MiB V1 input limit."
    : supportedOutputs(file).length ? "Ready. Choose an output format." : "This file type or size is not supported in this launch version.";
}
function clearFile() {
  selectedFile = null;
  fileInput.value = "";
  workspace.hidden = true;
  selectedFilePanel.hidden = true;
  convertButton.disabled = true;
  formatSelect.replaceChildren();
  status.textContent = "";
}
function pickFiles(files: FileList | null) { if (files?.[0]) setFile(files[0]); }

$("browse").addEventListener("click", event => { event.stopPropagation(); fileInput.click(); });
$("upload-button").addEventListener("click", event => { event.stopPropagation(); fileInput.click(); });
$("toggle-folders").addEventListener("click", () => {
  const shell = $("save-window");
  shell.classList.toggle("sidebar-hidden");
  $("folders-label").textContent = shell.classList.contains("sidebar-hidden") ? "Show Folders" : "Hide Folders";
});
$("close").addEventListener("click", clearFile);
$("refresh").addEventListener("click", () => { status.textContent = selectedFile ? "File selection is up to date." : "Choose a file to begin."; });
for (const folder of document.querySelectorAll<HTMLButtonElement>(".folder")) {
  folder.addEventListener("click", () => {
    document.querySelectorAll(".folder").forEach(item => item.classList.remove("active"));
    folder.classList.add("active");
    const category = folder.dataset.category || "documents";
    $("location-label").textContent = folder.querySelector("span")?.textContent || "Documents";
    fileInput.accept = category === "pictures" ? "image/*" : category === "music" ? "audio/*" : category === "videos" ? "video/*" : ".txt,.md,.csv,.log,.pdf,.doc,.docx";
  });
}
dropzone.addEventListener("click", event => {
  if ((event.target as HTMLElement).closest("button")) return;
  fileInput.click();
});
dropzone.addEventListener("keydown", event => {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.click(); }
});
fileInput.addEventListener("change", () => pickFiles(fileInput.files));
$("remove").addEventListener("click", clearFile);
for (const eventName of ["dragenter", "dragover"]) dropzone.addEventListener(eventName, event => {
  event.preventDefault(); dropzone.classList.add("dragging");
});
for (const eventName of ["dragleave", "drop"]) dropzone.addEventListener(eventName, event => {
  event.preventDefault(); dropzone.classList.remove("dragging");
});
dropzone.addEventListener("drop", event => pickFiles((event as DragEvent).dataTransfer?.files || null));

cancelButton.addEventListener("click", () => {
  if (!activeWorker) { clearFile(); return; }
  cancelRequested = true;
  activeWorker?.terminate();
  activeWorker = null;
  status.textContent = "Cancellation requested. Cleaning up temporary data…";
  cancelButton.disabled = true;
});

convertButton.addEventListener("click", async () => {
  if (!selectedFile || selectedFile.size > MAX_INPUT_BYTES) return;
  const input = selectedFile;
  const output = formats.find(format => format.id === formatSelect.value);
  if (!output || !supportedOutputs(selectedFile).some(item => item.id === output.id)) return;
  const base = input.name.replace(/\.[^/.]+$/, "");
  let saveTarget: SaveTarget | null = null;
  let staged: Awaited<ReturnType<typeof stageInOPFS>> | null = null;
  cancelRequested = false;
  convertButton.disabled = true;
  fileInput.disabled = true;
  ($("browse") as HTMLButtonElement).disabled = true;
  ($("remove") as HTMLButtonElement).disabled = true;
  dropzone.classList.add("busy");
  cancelButton.classList.add("visible");
  cancelButton.disabled = false;
  $("progress-wrap").hidden = false;
  const progress = $("progress") as HTMLProgressElement;
  const label = $("progress-label");
  const value = $("progress-value");
  const setProgress = (ratio: number, message: string) => {
    progress.value = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    value.textContent = `${progress.value}%`;
    label.textContent = message;
  };

  try {
    // Request the destination while the click's user activation is still live.
    const requestedName = outputName.value.trim() || `${base}.${output.extension}`;
    const safeName = requestedName.toLowerCase().endsWith(`.${output.extension}`) ? requestedName : `${requestedName.replace(/\.[^/.]+$/, "")}.${output.extension}`;
    saveTarget = await prepareSaveTarget(safeName, output.mime, output.extension);
    if (cancelRequested) throw new Error("Conversion cancelled.");

    setProgress(0, "Checking local storage");
    const capacity = await checkLocalCapacity(input.size);
    if (capacity.opfsAvailable) {
      setProgress(0.02, "Staging input in private browser storage");
      staged = await stageInOPFS(input, ratio => setProgress(0.02 + ratio * 0.13, "Staging input locally"));
    }
    if (cancelRequested) throw new Error("Conversion cancelled.");

    // Passing a File backed by OPFS to a worker avoids an explicit arrayBuffer()
    // copy here. The selected engine still determines its own peak memory use.
    const localFile = staged?.kind === "opfs" ? await staged.read() : input;
    setProgress(0.16, "Starting isolated conversion worker");
    const worker = new Worker(new URL("./worker/conversion.worker.ts", import.meta.url), { type: "module" });
    activeWorker = worker;
    const id = crypto.randomUUID();
    const result = await new Promise<Blob>((resolve, reject) => {
      worker.onmessage = event => {
        const message = event.data;
        if (message.id !== id) return;
        if (message.type === "progress") setProgress(0.16 + message.ratio * 0.78, message.message || "Converting locally");
        if (message.type === "complete") { worker.terminate(); activeWorker = null; resolve(message.blob); }
        if (message.type === "error") { worker.terminate(); activeWorker = null; reject(new Error(message.message)); }
      };
      worker.onerror = event => { worker.terminate(); activeWorker = null; reject(new Error(event.message || "Conversion worker failed.")); };
      worker.postMessage({ id, file: localFile, outputId: output.id });
    });

    if (cancelRequested) throw new Error("Conversion cancelled.");
    setProgress(0.95, "Streaming output to selected destination");
    const saveResult = await writeSaveTarget(saveTarget, result);
    saveTarget = null;
    setProgress(1, saveResult === "saved" ? "Saved to your chosen location" : "Download started");
    status.textContent = saveResult === "saved" ? "Conversion complete. File saved locally." : "Conversion complete. Browser download started.";
  } catch (error) {
    await abortSaveTarget(saveTarget);
    status.textContent = error instanceof Error ? error.message : String(error);
    setProgress(0, cancelRequested ? "Cancelled" : "Conversion stopped");
  } finally {
    activeWorker?.terminate();
    activeWorker = null;
    if (staged?.kind === "opfs") await staged.cleanup();
    convertButton.disabled = !selectedFile || selectedFile.size > MAX_INPUT_BYTES || supportedOutputs(selectedFile).length === 0;
    fileInput.disabled = false;
    ($("browse") as HTMLButtonElement).disabled = false;
    ($("remove") as HTMLButtonElement).disabled = false;
    dropzone.classList.remove("busy");
    cancelButton.classList.remove("visible");
    cancelButton.disabled = false;
  }
});
