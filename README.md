# Second Brain Visualizer

Convert Obsidian notes to an interactive knowledge graph using D3.js.

## What is this?

Converts Obsidian markdown notes to a structured format and renders them as a force-directed graph where you can explore topic connections. Node size reflects connection count; colors map to root folder.

## Features

- Converts Obsidian wikilinks to id-based format
- Extracts metadata and links for the graph
- D3 force-directed visualization with pan/zoom
- Node size by connection count, color by root folder
- Click nodes to view note content
- Mobile-friendly layout

## Setup

1. Set the Obsidian vault path in `package.json`:

```json
"build": "node scripts/obsidian-to-brain.js \"<path-to-your-obsidian-brain-folder>\""
```

2. Build:

```bash
pnpm build
```

3. Run `pnpm start` (builds and starts a local server) or `pnpm dev` (serves without building).

The build writes `dist/brain.json`; `index.html` loads it via fetch.

## Available Scripts

- `pnpm build` - Read Obsidian vault, generate dist/brain.json
- `pnpm build:without-me` - Same as build but excludes the `me` folder
- `pnpm start` - Build, sync to velora, and start local server
- `pnpm dev` - Start local server only (no build)

## Script Usage

```
node scripts/obsidian-to-brain.js <obsidian-brain-folder> [excluded-folders]
```

- `excluded-folders`: Comma-separated top-level folders to exclude (default: `me`)

## Project Structure

- `dist/brain.json` - Exported note graph (generated, gitignored)
- `index.html` - D3 visualization
- `scripts/obsidian-to-brain.js` - Obsidian vault → brain.json

## Requirements

- Node.js
- pnpm
- Obsidian notes in markdown with wikilinks
