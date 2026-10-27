# Project instructions

- Work on `main`. Commit and push coherent, tested milestones directly to GitHub `origin/main`; do not leave completed work only in the local checkout.
- Keep the app local at http://localhost:5173. Publishing to ChatGPT Sites requires explicit user approval. A Site is reserved in `.openai/hosting.json` but has not been deployed.
- This is a simple image tool: open URL, choose an image, edit, export. No branding, marketing copy, sample images, project/library/folder workflows, or project-file formats.
- Keep user images, edits, and undo history in browser memory. Do not upload them, save them to the server, or persist them. Downloads must be explicit PNG/PDF exports.
- Export no added text, headers, labels, or decorative frames. The user has requested paper sizes and a page preview: center artwork on the selected paper at its exact physical print scale, leaving unused paper white. Keep an image/sheet-size option with no surrounding paper. Never shrink artwork silently; flag a size mismatch and require a larger page or changed print size.
- Contact sheets are continuous strips or tight grids with at most hairline dividers. Each tile is a crop at the final physical print scale, not a fitted thumbnail. Variation labels belong in the interface, outside exported pixels.
- Run `npm test` and `npm run build` for functional changes. Verify rendering and physical-size exports in a browser when changing image or contact-sheet rendering.
