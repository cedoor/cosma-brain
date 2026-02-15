#!/usr/bin/env node
/**
 * Convert Obsidian brain notes directly to brain.json.
 * Reads Obsidian vault, resolves wikilinks, exports note graph for D3 viz.
 * Requires BRAIN_PATH in .env. Optional: BRAIN_IMAGES_PATH, EXCLUDED_FOLDERS.
 */

require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(process.cwd(), 'dist', 'brain.json');
const DIST_IMAGES_DIR = path.join(process.cwd(), 'dist', 'images');
const IMAGE_EXTENSIONS = ['.png', '.webp', '.jpg', '.jpeg', '.gif', '.svg'];

const TAG_LINE_PREFIX = 'Tags:';
const LINK_PREFIX = 'Link:';
const SECOND_BRAIN_TAG = 'Second Brain';
const DEFAULT_RECORD_TYPE = 'note';

const REGEX = {
  tagLink: /\[\[([^\]]+)\]\]/g,
  wikilink: /(!?)\[\[([^\]]+)\]\]/g,
  imageWikilink: /!\[\[([^\]]+)\]\]/g,
  linkId: /!?\[\[(\d{14}(?:-[a-f0-9]{4})?)(?:\|([^\]]+))?\]\]/g,
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

function findImageFiles(dir, list = []) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return list;
  for (const file of fs.readdirSync(dir)) {
    const fp = path.join(dir, file);
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) findImageFiles(fp, list);
    else if (IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase())) list.push(fp);
  }
  return list;
}

function buildImageMap(imagesDir) {
  const files = findImageFiles(imagesDir);
  const byName = new Map();
  for (const fp of files) {
    const name = path.basename(fp);
    byName.set(name, fp);
    const base = path.basename(fp, path.extname(fp));
    if (!byName.has(base)) byName.set(base, fp);
  }
  return byName;
}

function resolveImagePath(ref, imageMap) {
  const trimmed = ref.trim();
  if (imageMap.has(trimmed)) return imageMap.get(trimmed);
  for (const ext of IMAGE_EXTENSIONS) {
    const candidate = trimmed + ext;
    if (imageMap.has(candidate)) return imageMap.get(candidate);
  }
  return null;
}

function resolveImagesInContent(content, imageMap, distImagesDir) {
  if (!imageMap) return content.replace(REGEX.imageWikilink, () => '');
  fs.mkdirSync(distImagesDir, { recursive: true });
  return content.replace(REGEX.imageWikilink, (match, inner) => {
    const [namePart, sizePart] = inner.split('|').map(s => s?.trim());
    const raw = namePart || inner;
    const basename = raw.includes('/') ? raw.split(/[/\\]/).pop() : raw;
    const srcPath = resolveImagePath(basename, imageMap);
    if (!srcPath) return '';
    const destName = path.basename(srcPath);
    const destPath = path.join(distImagesDir, destName);
    fs.copyFileSync(srcPath, destPath);
    let sizeAttr = '';
    if (sizePart) {
      const [w, h] = sizePart.split(/x/i).map(s => s.trim()).filter(Boolean);
      if (h) sizeAttr = ` style="max-width: min(${w}px, 100%); max-height: min(${h}px, 100%)"`;
      else if (w) sizeAttr = ` style="max-width: min(${w}px, 100%)"`;
    }
    const alt = path.parse(destName).name.replace(/"/g, '&quot;');
    return `<img src="/dist/images/${destName}" alt="${alt}"${sizeAttr}>`;
  });
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

function resolveLinks(content, titleToId, titleToIdCi) {
  return content.replace(REGEX.wikilink, (match, isImage, linkText) => {
    if (isImage) return match;
    const [raw, display] = linkText.split('|').map(s => s?.trim());
    const target = path.parse(raw || linkText).name;
    const id = titleToId.get(target) ?? titleToIdCi.get(target?.toLowerCase());
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
  for (const m of body.matchAll(REGEX.linkId)) {
    if (!m[0].startsWith('!')) links.push({ targetId: m[1], displayText: m[2] || m[1] });
  }
  return links;
}

function bodyToReadable(body, idToTitle) {
  return body.replace(REGEX.linkId, (match, id, display) => {
    if (match.startsWith('!')) return '';
    const text = display || idToTitle.get(id) || id;
    return `[${text}](#n-${id})`;
  }).replace(/\n{3,}/g, '\n\n').trim();
}

function parseConfig() {
  const brainPath = process.env.BRAIN_PATH;
  const excludeStr = process.env.EXCLUDED_FOLDERS ?? '';
  if (!brainPath) {
    console.error('Missing BRAIN_PATH in .env. Copy .env.example to .env and set your Obsidian brain folder.');
    process.exit(1);
  }
  const brainDir = path.resolve(process.cwd(), brainPath);
  if (!fs.existsSync(brainDir) || !fs.statSync(brainDir).isDirectory()) {
    console.error(`Error: Folder does not exist: ${brainDir}`);
    process.exit(1);
  }
  const excludedFolders = excludeStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const imagesPath = process.env.BRAIN_IMAGES_PATH;
  const imagesDir = imagesPath ? path.resolve(process.cwd(), imagesPath) : null;
  return { brainDir, excludedFolders, imagesDir };
}

function exportBrain(brainDir, excludedFolders, imagesDir = null) {
  const allFiles = findMarkdownFiles(brainDir);
  const pathToId = new Map();
  const idToPath = new Map();
  for (const fp of allFiles) {
    let id = generateId(fp);
    if (idToPath.has(id) && idToPath.get(id) !== fp) {
      id = `${id}-${crypto.createHash('md5').update(fp).digest('hex').slice(0, 4)}`;
    }
    idToPath.set(id, fp);
    pathToId.set(fp, id);
  }
  const titleToId = new Map();
  const idToTitle = new Map();
  const titleToIdCi = new Map();
  for (const [fp, id] of pathToId) {
    const title = path.parse(fp).name;
    titleToId.set(title, id);
    idToTitle.set(id, title);
    titleToIdCi.set(title.toLowerCase(), id);
  }

  const included = allFiles.filter(f => !isExcluded(f, brainDir, excludedFolders));
  const notes = [];
  const imageMap = imagesDir ? buildImageMap(imagesDir) : null;

  for (const filePath of included) {
    let content = fs.readFileSync(filePath, 'utf-8');
    const { tags, content: body } = extractTags(content);
    content = resolveLinks(body, titleToId, titleToIdCi);
    content = addCategoryLinks(content, tags, pathToId.get(filePath), titleToId, idToTitle);
    const links = extractLinks(content);
    content = removeLeadingTagLinks(content);
    content = resolveImagesInContent(content, imageMap, DIST_IMAGES_DIR);

    const id = pathToId.get(filePath);
    const title = path.parse(filePath).name;
    const type = recordType(tags, filePath, brainDir);
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

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Exported ${notes.length} notes to ${OUTPUT_FILE}`);
}

const { brainDir, excludedFolders, imagesDir } = parseConfig();
exportBrain(brainDir, excludedFolders, imagesDir);
