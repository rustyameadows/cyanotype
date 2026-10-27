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

Work directly on GitHub `main` and push tested milestones. ChatGPT Sites publication is on hold until the user explicitly approves it.

## Flow

Open the URL, choose or drop an image, edit, export. The page starts empty. There is no branding, sample image, library, project format, or save/open-project workflow.

The editor includes exposure, contrast, shadows, highlights, grain, editable curves, inversion, mirroring, flipping, rotation, a clone brush, and undo/redo. The blue preview is an uncalibrated tone simulation.

## Physical scale

Set the final image width or height in mm or inches. The dimensions remain linked to the image aspect ratio.

Contact tests use the same physical print size. Choose the sample dimensions and position within the image. Every variation renders that crop at 100% of the final print scale. It never fits the full image into a smaller sample. The full image appears in a sample only when the sample matches the final image dimensions.

Layouts: four-up continuous strip, 3 × 2 grid, and 3 × 3 grid. Tiles touch with a default 0.1 mm divider; it can be removed or changed to 0.2 mm. The output bounds match the strip or grid exactly. Variation settings appear only in the interface.

## Export

PNG and PDF at 150, 300, or 600 DPI. Files contain only the image or sample tiles and selected hairline dividers: no text, headers, labels, margins, decorative borders, or printer-page composition.

PDF page dimensions equal the output's physical dimensions. PNG includes DPI metadata. Print at 100% / actual size.

## Data handling

User images, edits, and undo history stay in the current browser tab's memory. They are not uploaded, written to the server, or persisted. Reloading or closing the image clears the editing session. The previous prototype's IndexedDB autosave is deleted on load.

Only the explicit Download action creates an output file through the browser's normal download behavior. The browser decides its download location; the app does not request filesystem or folder access.

Source images above 6,000 px on the longest edge or 24 megapixels are resized with a notice. Exports are limited to 36 megapixels.

## Code

- `src/engine.js`: tone processing, curves, grain, cloning, physical geometry, and crop math.
- `src/render.js`: canvas rendering, text-free compositing, PDF encoding, PNG metadata.
- `src/app.js`: editing interface and in-memory state.
- `test/engine.test.js`: image and geometry regression tests.

Fonts are bundled under their OFL license in `assets/fonts/`.
