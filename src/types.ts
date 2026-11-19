export type OutputFormat = {
  id: string;
  label: string;
  extension: string;
  mime: string;
  category: "image" | "audio" | "video" | "document" | "archive";
};
export type ProgressCallback = (ratio: number, message?: string) => void;
export type Converter = {
  id: string;
  label: string;
  canConvert: (input: File, output: OutputFormat) => boolean;
  convert: (input: File, output: OutputFormat, onProgress: ProgressCallback) => Promise<Blob>;
};
