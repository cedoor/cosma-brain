#!/usr/bin/env node
/**
 * Convert Obsidian brain notes (excluding Me folder) to JSON for ChatGPT analysis.
 * Output includes note content, metadata, and link graph for connection analysis.
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(process.cwd(), 'brain.json');
const EXCLUDED_FOLDERS = ['me']; // case-insensitive

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n\n?/;
const WIKILINK_REGEX = /!?\[\[(\d{14})(?:\|([^\]]+))?\]\]/g;

function findMarkdownFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      findMarkdownFiles(filePath, fileList);
    } else if (file.endsWith('.md')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

function isExcluded(filePath, brainDir) {
  const relPath = path.relative(brainDir, filePath);
  const topFolder = relPath.split(path.sep)[0];
  return EXCLUDED_FOLDERS.includes(topFolder?.toLowerCase());
}

function parseFrontmatter(content) {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) return { frontmatter: null, body: content };

  let frontmatter = {};
  const yaml = match[1];
  let currentKey = null;
  let currentArray = null;

  for (const line of yaml.split('\n')) {
    if (line.startsWith('  - ')) {
      if (currentArray) currentArray.push(line.slice(4).trim());
      continue;
    }
    currentArray = null;
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) {
      const [, key, value] = kv;
      frontmatter[key] = value?.trim() || '';
      if (key === 'tags') currentArray = (frontmatter.tags = [frontmatter.tags].filter(Boolean));
    }
  }

  if (Array.isArray(frontmatter.tags) && frontmatter.tags.length === 0) {
    frontmatter.tags = [];
  } else if (typeof frontmatter.tags === 'string') {
    frontmatter.tags = [frontmatter.tags];
  }

  const body = content.slice(match[0].length);
  return { frontmatter, body };
}

function extractLinks(body) {
  const links = [];
  body.replace(WIKILINK_REGEX, (match, id, displayText) => {
    if (!match.startsWith('!')) links.push({ targetId: id, displayText: displayText || id });
    return '';
  });
  return links;
}

function bodyToReadable(body, idToTitle) {
  return body.replace(WIKILINK_REGEX, (match, id, displayText) => {
    if (match.startsWith('!')) return ''; // skip images
    const title = idToTitle.get(id) || displayText || id;
    return `→ ${title}`;
  }).replace(/\n{3,}/g, '\n\n').trim();
}

function buildIdToTitle(allFiles) {
  const map = new Map();
  for (const filePath of allFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter } = parseFrontmatter(content);
    if (frontmatter?.id && frontmatter?.title) {
      map.set(frontmatter.id, frontmatter.title);
    }
  }
  return map;
}

function validateInput(inputDir) {
  if (!inputDir) {
    console.error('Error: Please provide a folder path as an argument');
    console.error('Usage: node obsidian-to-json.js <folder-path>');
    process.exit(1);
  }
  const brainDir = path.resolve(inputDir);
  if (!fs.existsSync(brainDir)) {
    console.error(`Error: Folder does not exist: ${brainDir}`);
    process.exit(1);
  }
  if (!fs.statSync(brainDir).isDirectory()) {
    console.error(`Error: Path is not a directory: ${brainDir}`);
    process.exit(1);
  }
  return brainDir;
}

function exportBrain(brainDir) {
  const allFiles = findMarkdownFiles(brainDir);
  const idToTitle = buildIdToTitle(allFiles);

  const includedFiles = allFiles.filter((f) => !isExcluded(f, brainDir));
  const notes = [];

  for (const filePath of includedFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    const id = frontmatter?.id;
    const title = frontmatter?.title || path.parse(filePath).name;
    const type = frontmatter?.type || 'undefined';
    const tags = Array.isArray(frontmatter?.tags) ? frontmatter.tags : [];

    const linkList = extractLinks(body);
    const relPath = path.relative(brainDir, filePath);

    notes.push({
      id,
      title,
      type,
      tags,
      path: relPath,
      content: bodyToReadable(body, idToTitle),
      links: linkList,
    });
  }

  const backlinksMap = new Map();
  for (const note of notes) {
    for (const link of note.links) {
      const arr = backlinksMap.get(link.targetId) || [];
      arr.push(note.title);
      backlinksMap.set(link.targetId, arr);
    }
  }

  for (const note of notes) {
    note.backlinks = backlinksMap.get(note.id) || [];
  }

  const output = {
    metadata: {
      generatedAt: new Date().toISOString(),
      noteCount: notes.length,
      excludedFolders: EXCLUDED_FOLDERS,
    },
    noteIndex: notes.map((n) => ({ id: n.id, title: n.title })),
    notes,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Exported ${notes.length} notes to ${OUTPUT_FILE}`);
}

const brainDir = validateInput(process.argv[2]);
exportBrain(brainDir);
