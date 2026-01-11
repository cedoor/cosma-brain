# Cosma Brain

A tool to convert Obsidian notes to Cosma format and visualize them as an interactive knowledge graph using [Cosma](https://cosma.graphlab.fr/).

## What is this?

This project converts Obsidian markdown notes to Cosma format and visualizes them as an interactive knowledge graph (cosmoscope) that shows connections between ideas, concepts, and topics. It transforms your Obsidian vault into a beautiful, interactive visualization where you can explore relationships between notes.

## Features

- Converts Obsidian wikilinks (`[[note]]`) to Cosma-compatible format
- Extracts tags and metadata from Obsidian notes
- Generates an interactive knowledge graph visualization
- Customizable node colors and types based on note categories
- Preserves note structure and relationships

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Configure the conversion path:

Edit `package.json` to update the path in the `convert` script to point to your Obsidian notes folder:

```json
"convert": "node scripts/convert-obsidian.js \"<path-to-your-obsidian-notes-folder>\""
```

Alternatively, you can run the script directly with a path:

```bash
node scripts/convert-obsidian.js <path-to-obsidian-notes-folder>
```

3. Convert Obsidian Notes:

Once configured, run:

```bash
pnpm run convert
```

This converts Obsidian markdown files and saves them to the `notes/` directory.

4. Generate the cosmoscope:

```bash
pnpm start
```

This command:
- Converts Obsidian notes (if not already done)
- Runs `cosma modelize` to generate the graph
- Copies `cosmoscope.html` to your Documents folder
- Opens the visualization in your browser

The `cosmoscope.html` file is created in the project root and contains the interactive visualization.

## Available Scripts

- `pnpm start` - Full workflow: convert, modelize, copy, and open
- `pnpm modelize` - Convert notes and generate the cosmoscope
- `pnpm convert` - Convert Obsidian notes to Cosma format
- `pnpm open` - Open cosmoscope.html in browser

## Project Structure

- `notes/` - Converted markdown files (generated from Obsidian notes)
- `config.yml` - Cosma configuration (colors, types, graph settings)
- `cosmoscope.html` - Generated interactive visualization
- `scripts/convert-obsidian.js` - Converter script for Obsidian notes

## Configuration

Edit `config.yml` to customize:
- Record types and their colors (e.g., `devops`, `philosophy`, `learning`)
- Graph appearance (background color, text size, arrows)
- Force simulation settings (attraction forces, distances)
- Link types and styling

## Requirements

- Node.js
- pnpm
- Obsidian notes in markdown format with wikilinks
