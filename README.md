# Local Convert — launch MVP

A privacy-first, browser-based file converter. Conversion runs locally in the browser; this project has no upload API, account system, analytics, or server-side file processing.

## Launch support matrix

| Input | Output | Limit | Engine |
|---|---|---:|---|
| Common browser-decodable images (PNG, JPEG, WebP, GIF, BMP, AVIF where the browser can decode it) | PNG, JPEG, WebP | 25 MiB; 16 megapixels | Browser image decoder + OffscreenCanvas |
| Plain text, Markdown, CSV, LOG | PDF | 10 MiB | built-in minimal PDF writer; basic text layout |
| Any file | Single-file ZIP | 100 MiB | built-in ZIP STORE writer; no compression |

The global input rejection guard is 500 MiB. Active conversion paths impose lower limits (25 MiB for images, 10 MiB for text-to-PDF, and 100 MiB for ZIP). A file can be under the global limit and still be unsupported by the selected conversion engine. Formats are shown only when the current file and its size fit a supported conversion path.

## Run locally

```bash
npm install
npm run dev
```

## Build and deploy to Netlify

This repository includes `netlify.toml`. Netlify should use:
- Build command: `npm run build`
- Publish directory: `dist`
- Node: 20

Or connect the Git repository to Netlify and use the detected settings. The app is static; no environment variables or backend services are required.

Run `npm run build` before publishing. Test on the same browser/device types you intend to support. Chromium-based desktop browsers provide the native Save As picker; browsers without it use the download fallback.

## Privacy and storage

- Selected files are not sent to a server by this app.
- OPFS may be used to stage selected input in origin-private browser storage. It is quota-managed and temporary, not a permanent backup.
- The output is saved through the native File System Access API where available, otherwise through a browser download.
- The app does not request camera, microphone, or location access.

## Known launch limitations

- This is a focused MVP, not a universal converter. Audio/video transcoding, DOCX, arbitrary PDF conversion, PDF-to-editable-document, archive extraction, AVIF output, SVG rasterization, and 3D/CAD formats are not enabled.
- Image conversion decodes the image into a bitmap/canvas and can use substantially more memory than the compressed input. The 25 MiB / 16 MP limits are conservative guardrails, not guarantees for every device.
- ZIP input is read in chunks and stored without compression; output chunks are retained to construct the downloadable Blob. Expect the ZIP to be roughly the size of the input. This is not an end-to-end disk-to-disk streaming archive pipeline.
- Text-to-PDF is a simple text layout. It does not preserve document styling, tables, embedded images, or complex scripts.
- The 500 MiB ceiling is a global rejection limit, not a promise that all 500 MiB files are processable.
- Browser storage estimates can change and may be unavailable. OPFS is not guaranteed on every browser.

## Security headers

`netlify.toml` sets a restrictive Content Security Policy and standard browser security headers. No third-party scripts or remote codec assets are required by the launch build. If adding an engine later, update the CSP only for the exact resources it needs.
