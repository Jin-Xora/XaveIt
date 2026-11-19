import { imageConverter } from "./image";
import { archiveConverter } from "./archive";
import { textToPdfConverter } from "./pdf";
export const converters = [imageConverter, archiveConverter, textToPdfConverter];
