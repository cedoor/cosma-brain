# Cosma Brain

A tool to convert Obsidian notes to Cosma format and visualize them as an interactive knowledge graph using [Cosma](https://cosma.graphlab.fr/).

## What is this?

This project converts Obsidian markdown notes to Cosma format and visualizes them as an interactive knowledge graph (cosmoscope) that shows connections between ideas, concepts, and topics.

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Convert Obsidian Notes

To convert notes from Obsidian format to Cosma format:

```bash
pnpm run convert <path-to-obsidian-notes-folder>
```

3. Generate the cosmoscope:
```bash
pnpm start
```

This creates `cosmoscope.html` in the project root.

## Project Structure

- `notes/` - Markdown files organized by topic
- `config.yml` - Cosma configuration (colors, types, graph settings)
- `cosmoscope.html` - Generated interactive visualization
- `scripts/convert-obsidian.js` - Converter script for Obsidian notes
