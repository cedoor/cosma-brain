#!/usr/bin/env node
/**
 * Convert Obsidian brain notes directly to brain.json.
 * Reads Obsidian vault, resolves wikilinks, exports note graph for D3 viz.
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(process.cwd(), 'brain.json');
const INDEX_FILE = path.join(process.cwd(), 'index.html');
const BRAIN_DATA_PREFIX = 'const BRAIN_DATA = ';
const BRAIN_DATA_PLACEHOLDER = '"__BRAIN_EMBED__"';

const TAG_LINE_PREFIX = 'Tags:';
const LINK_PREFIX = 'Link:';
const SECOND_BRAIN_TAG = 'Second Brain';
const DEFAULT_RECORD_TYPE = 'undefined';

const REGEX = {
  tagLink: /\[\[([^\]]+)\]\]/g,
  wikilink: /(!?)\[\[([^\]]+)\]\]/g,
  linkId: /!?\[\[(\d{14})(?:\|([^\]]+))?\]\]/g,
  linkIdExtract: /\[\[(\d{14})/,
  leadingLinks: /^(\[\[[^\]]+\]\]\s*)+/,
};

function generateId(filePath) {
  const stat = fs.statSync(filePath);
  const m = stat.mtime;
  return `${m.getFullYear()}${String(m.getMonth() + 1).padStart(2, '0')}${String(m.getDate()).padStart(2, '0')}${String(m.getHours()).padStart(2, '0')}${String(m.getMinutes()).padStart(2, '0')}${String(m.getSeconds()).padStart(2, '0')}`;
}

function findMarkdownFiles(dir, list = []) {
  for (const file of fs.readdirSync(dir)) {
    const fp = path.join(dir, file);
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) findMarkdownFiles(fp, list);
    else if (file.endsWith('.md')) list.push(fp);
  }
  return list;
}

function isExcluded(filePath, brainDir, excludedFolders) {
  const top = path.relative(brainDir, filePath).split(path.sep)[0];
  return excludedFolders.includes(top?.toLowerCase());
}

function extractTags(content) {
  const lines = content.split('\n');
  const tags = [];
  if (lines[0]?.startsWith(TAG_LINE_PREFIX)) {
    const m = lines[0].match(REGEX.tagLink);
    if (m) tags.push(...m.map(t => t.slice(2, -2)));
    content = lines.slice(1).join('\n').replace(/^\n+/, '');
  }
  return { tags, content };
}

function recordType(tags, filePath, inputDir) {
  if (tags.length > 0 && tags[0] !== SECOND_BRAIN_TAG) {
    return tags[0].toLowerCase().replace(/\s+/g, '-');
  }
  const parts = path.relative(inputDir, filePath).split(path.sep);
  return parts.length > 1 ? parts[parts.length - 2].toLowerCase().replace(/\s+/g, '-') : DEFAULT_RECORD_TYPE;
}

function resolveLinks(content, titleToId) {
  const ci = new Map([...titleToId].map(([k, v]) => [k.toLowerCase(), v]));
  return content.replace(REGEX.wikilink, (match, isImage, linkText) => {
    if (isImage) return match;
    const [raw, display] = linkText.split('|').map(s => s?.trim());
    const target = path.parse(raw || linkText).name;
    const id = titleToId.get(target) ?? ci.get(target?.toLowerCase());
    if (id) return `[[${id}|${display || target}]]`;
    return match;
  });
}

function addCategoryLinks(content, tags, id, titleToId, idToTitle) {
  const add = [];
  if (tags.includes(SECOND_BRAIN_TAG)) {
    const sbId = titleToId.get(SECOND_BRAIN_TAG);
    if (sbId && sbId !== id && !new RegExp(`\\[\\[${sbId}`).test(content)) {
      add.push(`[[${sbId}|${SECOND_BRAIN_TAG}]]`);
    }
  }
  if (tags[0] && tags[0] !== SECOND_BRAIN_TAG) {
    const catId = titleToId.get(tags[0]);
    if (catId && catId !== id && !new RegExp(`\\[\\[${catId}`).test(content)) {
      add.push(`[[${catId}|${idToTitle.get(catId) || tags[0]}]]`);
    }
  }
  return add.length ? `${add.join(' ')}\n\n${content.trim()}` : content;
}

function removeLeadingTagLinks(content) {
  const m = content.match(REGEX.leadingLinks);
  if (m) {
    const after = content.slice(m[0].length).trim();
    if (after.startsWith(LINK_PREFIX)) return after;
  }
  return content;
}

function extractLinks(body) {
  const links = [];
  body.replace(REGEX.linkId, (match, id, display) => {
    if (!match.startsWith('!')) links.push({ targetId: id, displayText: display || id });
    return '';
  });
  return links;
}

function bodyToReadable(body, idToTitle) {
  return body.replace(REGEX.linkId, (match, id, display) => {
    if (match.startsWith('!')) return '';
    return `→ ${idToTitle.get(id) || display || id}`;
  }).replace(/\n{3,}/g, '\n\n').trim();
}

function parseArgs() {
  const args = process.argv.slice(2);
  const restore = args.includes('--restore');
  const filtered = args.filter(a => a !== '--restore');
  const pathArg = filtered[0];
  const excludeArg = filtered[1] ?? 'me';
  if (!restore && !pathArg) {
    console.error('Usage: node obsidian-to-brain.js <obsidian-brain-folder> [excluded-folders] [--restore]');
    console.error('  excluded-folders: comma-separated, default: me');
    console.error('  --restore: restore placeholder in index.html (no export)');
    process.exit(1);
  }
  const brainDir = pathArg ? path.resolve(pathArg) : null;
  if (pathArg && (!fs.existsSync(brainDir) || !fs.statSync(brainDir).isDirectory())) {
    console.error(`Error: Folder does not exist: ${brainDir}`);
    process.exit(1);
  }
  const excludedFolders = excludeArg.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return { brainDir, excludedFolders, restore };
}

const SCRIPT_CONTINUATION = /};\s*const graphEl\s*=/;

function findDataBounds(html) {
  const start = html.indexOf(BRAIN_DATA_PREFIX);
  if (start === -1) return null;
  let i = start + BRAIN_DATA_PREFIX.length;
  const first = html[i];
  if (first === '"') {
    const end = html.indexOf('";', i + 1);
    return end === -1 ? null : { start, end: end + 2 };
  }
  if (first === '{') {
    const sentinelMatch = html.slice(start).match(SCRIPT_CONTINUATION);
    if (sentinelMatch) {
      const end = start + sentinelMatch.index + 2; // +2 for '};', end is after ';'
      return { start, end };
    }
    let depth = 0;
    for (; i < html.length; i++) {
      const c = html[i];
      if (c === '"') {
        for (i++; i < html.length; i++) {
          if (html[i] === '\\') i++;
          else if (html[i] === '"') break;
        }
        continue;
      }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return { start, end: html.indexOf(';', i) + 1 }; }
    }
  }
  return null;
}

function embedBrain() {
  const json = fs.readFileSync(OUTPUT_FILE, 'utf-8');
  const escaped = json.replace(/<\/script/gi, '<\\/script');
  let html = fs.readFileSync(INDEX_FILE, 'utf-8');
  const bounds = findDataBounds(html);
  if (!bounds) {
    console.error('BRAIN_DATA not found in index.html');
    process.exit(1);
  }
  html = html.slice(0, bounds.start) + BRAIN_DATA_PREFIX + escaped + ';' + html.slice(bounds.end);
  fs.writeFileSync(INDEX_FILE, html, 'utf-8');
  console.log('Embedded brain.json into index.html');
}

function restorePlaceholder() {
  let html = fs.readFileSync(INDEX_FILE, 'utf-8');
  const bounds = findDataBounds(html);
  if (!bounds) {
    console.error('BRAIN_DATA not found in index.html');
    process.exit(1);
  }
  html = html.slice(0, bounds.start) + BRAIN_DATA_PREFIX + BRAIN_DATA_PLACEHOLDER + ';' + html.slice(bounds.end);
  fs.writeFileSync(INDEX_FILE, html, 'utf-8');
  console.log('Restored placeholder in index.html');
}

function exportBrain(brainDir, excludedFolders) {
  const allFiles = findMarkdownFiles(brainDir);
  const titleToId = new Map();
  const idToTitle = new Map();
  for (const fp of allFiles) {
    const id = generateId(fp);
    const title = path.parse(fp).name;
    titleToId.set(title, id);
    idToTitle.set(id, title);
  }

  const included = allFiles.filter(f => !isExcluded(f, brainDir, excludedFolders));
  const notes = [];

  for (const filePath of included) {
    let content = fs.readFileSync(filePath, 'utf-8');
    const { tags, content: body } = extractTags(content);
    content = resolveLinks(body, titleToId);
    content = addCategoryLinks(content, tags, generateId(filePath), titleToId, idToTitle);
    content = removeLeadingTagLinks(content);

    const id = generateId(filePath);
    const title = path.parse(filePath).name;
    const type = recordType(tags, filePath, brainDir);
    const links = extractLinks(content);
    const relPath = path.relative(brainDir, filePath);

    notes.push({
      id,
      title,
      type,
      tags,
      path: relPath,
      content: bodyToReadable(content, idToTitle),
      links,
    });
  }

  const backlinks = new Map();
  for (const note of notes) {
    for (const link of note.links) {
      const arr = backlinks.get(link.targetId) || [];
      arr.push(note.title);
      backlinks.set(link.targetId, arr);
    }
  }
  for (const note of notes) {
    note.backlinks = backlinks.get(note.id) || [];
  }

  const output = {
    metadata: { generatedAt: new Date().toISOString(), noteCount: notes.length, excludedFolders },
    noteIndex: notes.map(n => ({ id: n.id, title: n.title })),
    notes,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Exported ${notes.length} notes to ${OUTPUT_FILE}`);
}

const { brainDir, excludedFolders, restore } = parseArgs();
if (restore) {
  restorePlaceholder();
} else {
  exportBrain(brainDir, excludedFolders);
  embedBrain();
}
