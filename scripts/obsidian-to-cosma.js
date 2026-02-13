#!/usr/bin/env node
/**
 * Convert Obsidian markdown files to Cosma format.
 * Converts inline Tags: [[tag]] to YAML frontmatter.
 */

const fs = require('fs');
const path = require('path');

const SECOND_BRAIN_TAG = 'Second Brain';
const DEFAULT_RECORD_TYPE = 'undefined';
const TAG_LINE_PREFIX = 'Tags:';
const LINK_PREFIX = 'Link:';
const OUTPUT_DIR = 'notes';

const REGEX_PATTERNS = {
  tagLink: /\[\[([^\]]+)\]\]/g,
  wikilink: /(!?)\[\[([^\]]+)\]\]/g,
  linkId: /\[\[(\d{14})(?:\|[^\]]+)?\]\]/g,
  linkIdExtract: /\[\[(\d{14})/,
  leadingLinks: /^(\[\[[^\]]+\]\]\s*)+/,
  frontmatter: /^(---\n[\s\S]*?\n---\n\n)/,
};

function generateId(filePath) {
  const stat = fs.statSync(filePath);
  const mtime = stat.mtime;
  
  const year = mtime.getFullYear();
  const month = String(mtime.getMonth() + 1).padStart(2, '0');
  const day = String(mtime.getDate()).padStart(2, '0');
  const hours = String(mtime.getHours()).padStart(2, '0');
  const minutes = String(mtime.getMinutes()).padStart(2, '0');
  const seconds = String(mtime.getSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function extractTags(content) {
  const lines = content.split('\n');
  const tags = [];
  
  if (lines.length > 0 && lines[0].startsWith(TAG_LINE_PREFIX)) {
    const tagMatches = lines[0].match(REGEX_PATTERNS.tagLink);
    if (tagMatches) {
      tags.push(...tagMatches.map(tag => tag.slice(2, -2)));
    }
    content = lines.slice(1).join('\n').replace(/^\n+/, '');
  }
  
  return { tags, content };
}

function determineRecordType(tags, filePath, inputDir) {
  if (tags.length > 0 && tags[0] !== SECOND_BRAIN_TAG) {
    return tags[0].toLowerCase().replace(/\s+/g, '-');
  }
  
  const relPath = path.relative(inputDir, filePath);
  const pathParts = relPath.split(path.sep);
  if (pathParts.length > 1) {
    return pathParts[pathParts.length - 2].toLowerCase().replace(/\s+/g, '-');
  }
  
  return DEFAULT_RECORD_TYPE;
}

function buildFrontmatter(title, id, recordType, tags) {
  let frontmatter = `---
title: ${title}
id: ${id}
type: ${recordType}
`;
  
  if (tags.length > 0) {
    frontmatter += 'tags:\n';
    for (const tag of tags) {
      frontmatter += `  - ${tag}\n`;
    }
  }
  
  frontmatter += '---\n\n';
  return frontmatter;
}

function createLinkPattern(id) {
  return new RegExp(`\\[\\[${id}(\\|[^\\]]+)?\\]\\]`);
}

function shouldAddLink(content, targetId, linkText) {
  if (!targetId) return false;
  const pattern = createLinkPattern(targetId);
  return !pattern.test(content);
}

function addCategoryLinks(content, tags, id, titleToIdMap, idToTitleMap) {
  const linksToAdd = [];
  
  if (tags.includes(SECOND_BRAIN_TAG)) {
    const secondBrainId = titleToIdMap.get(SECOND_BRAIN_TAG);
    if (shouldAddLink(content, secondBrainId, SECOND_BRAIN_TAG) && secondBrainId !== id) {
      linksToAdd.push(`[[${secondBrainId}|${SECOND_BRAIN_TAG}]]`);
    }
  }
  
  if (tags.length > 0 && tags[0] !== SECOND_BRAIN_TAG) {
    const categoryTag = tags[0];
    const categoryId = titleToIdMap.get(categoryTag);
    if (shouldAddLink(content, categoryId, categoryTag) && categoryId !== id) {
      const categoryTitle = idToTitleMap.get(categoryId) || categoryTag;
      linksToAdd.push(`[[${categoryId}|${categoryTitle}]]`);
    }
  }
  
  if (linksToAdd.length > 0) {
    return `${linksToAdd.join(' ')}\n\n${content.trim()}`;
  }
  
  return content;
}

function removeOldTagLinks(content) {
  const linkMatch = content.match(REGEX_PATTERNS.leadingLinks);
  if (linkMatch) {
    const afterLinks = content.substring(linkMatch[0].length).trim();
    if (afterLinks.startsWith(LINK_PREFIX)) {
      return afterLinks;
    }
  }
  return content;
}

function convertFile(filePath, titleToIdMap, idToTitleMap, inputDir, fileId) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const title = path.parse(filePath).name;
  const id = fileId || generateId(filePath);
  
  const { tags, content: contentWithoutTags } = extractTags(content);
  content = contentWithoutTags;
  
  const recordType = determineRecordType(tags, filePath, inputDir);
  const frontmatter = buildFrontmatter(title, id, recordType, tags);
  
  content = convertLinks(content, titleToIdMap);
  content = addCategoryLinks(content, tags, id, titleToIdMap, idToTitleMap);
  content = removeOldTagLinks(content);
  
  return frontmatter + content;
}

function convertLinks(content, titleToIdMap) {
  const caseInsensitiveMap = new Map();
  for (const [key, value] of titleToIdMap.entries()) {
    caseInsensitiveMap.set(key.toLowerCase(), value);
  }
  
  return content.replace(REGEX_PATTERNS.wikilink, (match, isImage, linkText) => {
    if (isImage) {
      return match;
    }
    
    const parts = linkText.split('|');
    const linkTarget = parts[0].trim();
    const displayText = parts[1] ? parts[1].trim() : null;
    
    const fileName = path.basename(linkTarget);
    const titleWithoutExt = path.parse(fileName).name;
    
    let targetId = titleToIdMap.get(titleWithoutExt);
    if (!targetId) {
      targetId = caseInsensitiveMap.get(titleWithoutExt.toLowerCase());
    }
    
    if (targetId) {
      if (displayText) {
        return `[[${targetId}|${displayText}]]`;
      }
      return `[[${targetId}|${titleWithoutExt}]]`;
    }
    
    return match;
  });
}

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

function buildFileMaps(mdFiles) {
  const titleToIdMap = new Map();
  const idToTitleMap = new Map();
  const fileIdCache = new Map();
  
  for (const mdFile of mdFiles) {
    const id = generateId(mdFile);
    fileIdCache.set(mdFile, id);
    
    const title = path.parse(mdFile).name;
    titleToIdMap.set(title, id);
    idToTitleMap.set(id, title);
    
    const fileName = path.basename(mdFile);
    const fileNameWithoutExt = path.parse(fileName).name;
    if (fileNameWithoutExt !== title) {
      titleToIdMap.set(fileNameWithoutExt, id);
    }
  }
  
  return { titleToIdMap, idToTitleMap, fileIdCache };
}

function processFiles(mdFiles, brainDir, titleToIdMap, idToTitleMap, fileIdCache) {
  const outputDir = path.join(process.cwd(), OUTPUT_DIR);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const fileIdToPathMap = new Map();
  let convertedCount = 0;
  
  for (const mdFile of mdFiles) {
    try {
      const id = fileIdCache.get(mdFile);
      const newContent = convertFile(mdFile, titleToIdMap, idToTitleMap, brainDir, id);
      
      const relPath = path.relative(brainDir, mdFile);
      const outputPath = path.join(outputDir, relPath);
      
      const outputParent = path.dirname(outputPath);
      if (!fs.existsSync(outputParent)) {
        fs.mkdirSync(outputParent, { recursive: true });
      }
      
      fs.writeFileSync(outputPath, newContent, 'utf-8');
      fileIdToPathMap.set(id, outputPath);
      
      convertedCount++;
      console.log(`✓ Converted: ${relPath}`);
    } catch (error) {
      console.error(`✗ Error converting ${mdFile}: ${error.message}`);
    }
  }
  
  return { outputDir, fileIdToPathMap, convertedCount };
}

function addBacklinks(mdFiles, brainDir, fileIdCache, fileIdToPathMap) {
  for (const mdFile of mdFiles) {
    try {
      const id = fileIdCache.get(mdFile);
      const relPath = path.relative(brainDir, mdFile);
      const outputPath = fileIdToPathMap.get(id);
      
      if (!outputPath || !fs.existsSync(outputPath)) continue;
      
      let content = fs.readFileSync(outputPath, 'utf-8');
      const linkMatches = content.match(REGEX_PATTERNS.linkId);
      
      if (linkMatches) {
        const linkedIds = new Set();
        for (const match of linkMatches) {
          const linkId = match.match(REGEX_PATTERNS.linkIdExtract)[1];
          if (linkId !== id) {
            linkedIds.add(linkId);
          }
        }
        
        for (const linkedId of linkedIds) {
          const linkedFilePath = fileIdToPathMap.get(linkedId);
          if (linkedFilePath && fs.existsSync(linkedFilePath)) {
            let linkedContent = fs.readFileSync(linkedFilePath, 'utf-8');
            const backLinkPattern = createLinkPattern(id);
            if (!backLinkPattern.test(linkedContent)) {
              const currentTitle = path.parse(mdFile).name;
              linkedContent = linkedContent.replace(
                REGEX_PATTERNS.frontmatter,
                `$1[[${id}|${currentTitle}]] `
              );
              fs.writeFileSync(linkedFilePath, linkedContent, 'utf-8');
            }
          }
        }
      }
    } catch (error) {
      console.error(`✗ Error adding back-links for ${mdFile}: ${error.message}`);
    }
  }
}

function cleanTagLinks(mdFiles, brainDir, fileIdCache, fileIdToPathMap) {
  for (const mdFile of mdFiles) {
    try {
      const id = fileIdCache.get(mdFile);
      const outputPath = fileIdToPathMap.get(id);
      
      if (!outputPath || !fs.existsSync(outputPath)) continue;
      
      let content = fs.readFileSync(outputPath, 'utf-8');
      const frontmatterEnd = content.indexOf('---\n\n', content.indexOf('---') + 4);
      if (frontmatterEnd === -1) continue;
      
      const frontmatter = content.substring(0, frontmatterEnd + 5);
      let bodyContent = content.substring(frontmatterEnd + 5);
      
      const linkMatch = bodyContent.match(REGEX_PATTERNS.leadingLinks);
      if (linkMatch) {
        const afterLinks = bodyContent.substring(linkMatch[0].length).trim();
        if (afterLinks.startsWith(LINK_PREFIX)) {
          bodyContent = afterLinks;
        }
      }
      
      fs.writeFileSync(outputPath, frontmatter + bodyContent, 'utf-8');
    } catch (error) {
      // Silently continue if there's an error
    }
  }
}

function validateInput(inputDir) {
  if (!inputDir) {
    console.error('Error: Please provide a folder path as an argument');
    console.error('Usage: node convert-obsidian.js <folder-path>');
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

function main() {
  const brainDir = validateInput(process.argv[2]);
  const mdFiles = findMarkdownFiles(brainDir);
  
  console.log(`Found ${mdFiles.length} markdown files`);
  
  const { titleToIdMap, idToTitleMap, fileIdCache } = buildFileMaps(mdFiles);
  const { outputDir, fileIdToPathMap, convertedCount } = processFiles(
    mdFiles,
    brainDir,
    titleToIdMap,
    idToTitleMap,
    fileIdCache
  );
  
  addBacklinks(mdFiles, brainDir, fileIdCache, fileIdToPathMap);
  cleanTagLinks(mdFiles, brainDir, fileIdCache, fileIdToPathMap);
  
  console.log(`\nConverted ${convertedCount}/${mdFiles.length} files`);
  console.log(`Output directory: ${outputDir}`);
}

if (require.main === module) {
  main();
}

module.exports = { convertFile, findMarkdownFiles, convertLinks };
