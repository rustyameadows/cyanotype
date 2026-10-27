# Cyanotype

A local, browser-based digital darkroom for preparing cyanotype transparency negatives and contact-sheet tests.

## Run locally

Requires Node.js 20 or newer. There are no package dependencies to install.

```sh
npm run dev
```

Open **http://localhost:5173**. The development server listens only on this computer. Set `PORT` if another port is needed.

```sh
npm test
npm run build
```

The build copies the app and its bundled assets into `dist/` for static hosting. `.openai/hosting.json` reserves the ChatGPT Site; **do not publish or deploy until the user explicitly approves**. Development currently stays local.

## Image lab

- Upload or drop a JPEG, PNG, WebP, AVIF, or BMP. An included forest photograph gives the empty workspace a starting image.
- Adjust exposure, contrast, shadows, highlights, grain, and a five-point, shape-preserving tone curve. Curve points support pointer dragging and arrow keys. Double-click a tonal slider to reset it.
- Compare the original, grayscale negative, and an approximate blue print. Invert, mirror, flip, and rotate in 90-degree steps.
- Use the clone brush to remove small objects manually: Alt-click a clean source or click **Pick source point**, then paint. Brush strokes are reversible with Undo/Redo. This is local clone retouching; it does not use generative AI.
- Use Save project to download a `.cyanotype` file containing adjustments, the untouched source, and the retouched image. Open it with the folder tool. The current workspace also autosaves in IndexedDB in this browser.

## Contact sheets

Choose a four-up vertical strip, a 3 × 2 grid, or a 3 × 3 grid. Vary one adjustment across all frames, or two adjustments independently across columns and rows. Steps shift into the available control range at its limits; steps narrow when the requested range is too wide, keeping all tests distinct. Labels show the actual values in each cell.

Select a frame to inspect it and apply its settings to the image lab. Choose Letter, A4, A5, or 8-inch square paper, spacing, margins, labels, and cutting guides. The four-up strip is centered on the sheet in a 70 mm column.

## Print files

Export a single sized image or the contact sheet as PDF or PNG at 150, 300, or 600 DPI. Custom paper dimensions are available in the export dialog. PDF page dimensions are stored in physical points; PNG output includes a pHYs resolution chunk. Exports use the requested grayscale polarity regardless of the blue preview. Mirror and rotation settings carry through to the file.

Print at **100% / actual size**, with fit-to-page disabled. Printer settings, transparency film, coating, paper, and exposure determine the actual print. The blue preview is an uncalibrated tonal simulation and does not predict UV exposure time.

Large sources are limited to a 6,000 px longest edge and 24 megapixels, with a notice when resized. Exports are limited to 36 megapixels to control memory usage. The app reports effective source resolution when sizing a single image; a higher export DPI does not add source detail.

## Structure

- `src/engine.js`: pure tone processing, curves, deterministic grain, clone stamping, and physical layout math.
- `src/render.js`: canvas transforms, sheet compositing, PDF encoding, and PNG DPI metadata.
- `src/app.js`: interface, history, upload, exports, portable projects, and local persistence.
- `test/engine.test.js`: processing and layout regression tests.
- `scripts/serve.mjs`: loopback-only preview server.
- `scripts/build.mjs`: dependency-free static build.

All image processing and persistence happen on the device. Fonts are bundled, with their OFL licenses in `assets/fonts/`. The demonstration image is [from Unsplash](https://images.unsplash.com/photo-1518495973542-4542c06a5843).
