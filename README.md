# Image prep

A browser-only image editor for cyanotype negatives and full-scale contact tests.

## Local development

Node.js 20+; no dependencies to install.

```sh
npm run dev
npm test
npm run build
```

Open http://localhost:5173. The server binds to loopback only. `dist/` contains the static build.

Work directly on GitHub `main` and push tested milestones. The current release is published privately at [the hosted app](https://cyanotype-darkroom.rameadows.chatgpt.site), following user approval on October 26, 2026. App source revision: `e870ef7`. Publishing additional versions requires user approval.

## Flow

Open the URL, choose or drop an image, edit, export. Refresh restores the current image and settings from browser storage. With no saved session, the page starts at the image picker. There is no branding, sample image, library, project format, or save/open-project workflow.

The editor includes exposure, contrast, shadows, highlights, grain, editable curves, inversion, mirroring, flipping, rotation, a clone brush, and undo/redo. The blue preview is an uncalibrated tone simulation.

## Physical scale

Set the final image width or height in mm or inches. The dimensions remain linked to the image aspect ratio.

Contact tests use the same physical print size. Choose the sample dimensions and position within the image. Every variation renders that crop at 100% of the final print scale. It never fits the full image into a smaller sample. The full image appears in a sample only when the sample matches the final image dimensions.

Layouts: four-up continuous strip, 3 × 2 grid, and 3 × 3 grid. Tiles touch with a default 0.1 mm divider; it can be removed or changed to 0.2 mm. The output bounds match the strip or grid exactly. Variation settings appear only in the interface.

## Export

PNG and PDF at 150, 300, or 600 DPI. Choose Letter (8.5 × 11), Tabloid (11 × 17), Legal, 13 × 19, 4 × 6, 5 × 7, 8 × 10, 11 × 14, A5, A4, or A3 paper, in portrait or landscape. Export shows a live page preview. The image or contiguous test sheet is centered at its exact physical print size; unused paper is white. If the artwork does not fit, download is blocked until the paper or print size changes. It is never silently scaled down.

Select **Image / sheet size** to export just the artwork with no surrounding paper. No mode adds text, headers, labels, or decorative borders. PDF page dimensions match the selected paper (or exact artwork size); PNG has matching raster dimensions and DPI metadata. Print at 100% / actual size. Very large pages may require a lower DPI to stay under the export memory limit.

## Data handling

The current image, retouched version, original image, curves, print dimensions, contact-sheet settings, and export choices are saved locally in IndexedDB in this browser. Refresh restores that workspace. Closing the image with × clears the saved session. Undo/redo history is held in memory and starts fresh after reload.

User images and edits are never uploaded or written to the server or a folder. Browser data can be removed with the browser's normal site-data controls. If local storage is unavailable or full, editing still works and the app reports that refresh recovery is unavailable.

Browser storage belongs to each site origin. The hosted app and `localhost:5173` have separate saved sessions; open an image once on the hosted app to start its local workspace.

Only the explicit Download action creates an output file through the browser's normal download behavior. The browser decides its download location; the app does not request filesystem or folder access.

Source images above 6,000 px on the longest edge or 24 megapixels are resized with a notice. Exports are limited to 36 megapixels.

## Code

- `src/engine.js`: tone processing, curves, grain, cloning, physical geometry, and crop math.
- `src/render.js`: canvas rendering, text-free compositing, PDF encoding, PNG metadata.
- `src/app.js`: editing interface and in-memory state.
- `src/session.js`: browser-local session storage and validation.
- `test/engine.test.js`: image and geometry regression tests.

The interface uses black and white surfaces, a viewer grid, and the system UI font stack (San Francisco on Apple devices), with SF Mono for numeric controls and measurements. No fonts are downloaded.
