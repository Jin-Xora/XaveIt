/// <reference lib="webworker" />
import { converters } from "../engines";
import { formats } from "../formats";

type RequestMessage = { id:string; file:File; outputId:string };
const scope = self as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<RequestMessage>) => {
  const { id, file, outputId } = event.data;
  try {
    if (file.size > 500 * 1024 * 1024) throw new Error("Input exceeds the 500 MiB limit.");
    const output = formats.find(f => f.id === outputId);
    if (!output) throw new Error("Unknown output format.");
    const engine = converters.find(c => c.canConvert(file, output));
    if (!engine) throw new Error(`No installed converter can convert ${file.type || "this file"} to ${output.label}.`);
    const blob = await engine.convert(file, output, (ratio, message) => {
      scope.postMessage({ id, type:"progress", ratio, message });
    });
    scope.postMessage({ id, type:"complete", blob });
  } catch (error) {
    scope.postMessage({ id, type:"error", message: error instanceof Error ? error.message : String(error) });
  }
};
