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

1. Copy `.env.example` to `.env` and configure:
   - `BRAIN_PATH` - Path to your Obsidian brain folder (absolute or relative to project root)
   - `EXCLUDED_FOLDERS` - Comma-separated top-level folders to exclude (e.g. `Me`, `Private`)

2. Build:

```bash
pnpm build
```

3. Run `pnpm start` (builds and starts a local server).

The build writes `dist/brain.json`; `index.html` loads it via fetch.

## Available Scripts

- `pnpm build` - Read Obsidian vault, generate dist/brain.json (uses BRAIN_PATH and EXCLUDED_FOLDERS from .env)
- `pnpm start` - Build and start local server

## Project Structure

- `dist/brain.json` - Exported note graph (generated, gitignored)
- `index.html` - D3 visualization
- `scripts/obsidian-to-brain.js` - Obsidian vault → brain.json

## Requirements

- Node.js
- pnpm
- Obsidian notes in markdown with wikilinks
