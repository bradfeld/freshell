#!/usr/bin/env node
/**
 * Prepare Icons Script
 *
 * Reads SVGs from ./originals/, crops them to the smallest enclosing square,
 * resizes them to a nominal size, and writes to the parent directory.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ORIGINALS_DIR = join(__dirname, 'originals');
const OUTPUT_DIR = __dirname;
const NOMINAL_SIZE = 64; // Output size in viewBox units

/**
 * Parse viewBox string into numeric values
 */
function parseViewBox(viewBoxStr) {
  const parts = viewBoxStr.trim().split(/\s+/).map(Number);
  return { minX: parts[0], minY: parts[1], width: parts[2], height: parts[3] };
}

/**
 * Parse all path 'd' attributes and compute their bounding box.
 * This is a simplified parser that handles M, L, H, V, C, S, Q, T, A, Z commands.
 */
function computePathsBoundingBox(svgContent) {
  const pathRegex = /<path[^>]*\bd\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasPath = false;

  let match;
  while ((match = pathRegex.exec(svgContent)) !== null) {
    const d = match[1];
    const bounds = getPathBounds(d);
    if (bounds) {
      hasPath = true;
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    }
  }

  // Also check for rect elements
  const rectRegex = /<rect[^>]*>/gi;
  while ((match = rectRegex.exec(svgContent)) !== null) {
    const rect = match[0];
    const x = parseFloat(rect.match(/\bx\s*=\s*["']([^"']+)["']/)?.[1] || '0');
    const y = parseFloat(rect.match(/\by\s*=\s*["']([^"']+)["']/)?.[1] || '0');
    const w = parseFloat(rect.match(/\bwidth\s*=\s*["']([^"']+)["']/)?.[1] || '0');
    const h = parseFloat(rect.match(/\bheight\s*=\s*["']([^"']+)["']/)?.[1] || '0');
    if (w > 0 && h > 0) {
      hasPath = true;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    }
  }

  if (!hasPath) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Parse numbers from a path command arguments string.
 * Handles cases like "1.5.5" (1.5 and 0.5) and "1-2" (1 and -2)
 */
function parsePathNumbers(str) {
  const numbers = [];
  // Match: optional sign, digits with optional decimal, or just decimal
  const regex = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
  let match;
  while ((match = regex.exec(str)) !== null) {
    numbers.push(parseFloat(match[0]));
  }
  return numbers;
}

/**
 * Parse SVG path 'd' attribute and compute bounding box
 */
function getPathBounds(d) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let x = 0, y = 0;
  let startX = 0, startY = 0;

  // Tokenize the path - split on commands
  const commands = d.match(/[a-zA-Z][^a-zA-Z]*/g) || [];

  for (const cmd of commands) {
    const type = cmd[0];
    const args = parsePathNumbers(cmd.slice(1));
    let i = 0;

    const updateBounds = (px, py) => {
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    };

    switch (type) {
      case 'M':
        while (i < args.length) {
          x = args[i++];
          y = args[i++];
          updateBounds(x, y);
          startX = x; startY = y;
        }
        break;
      case 'm':
        while (i < args.length) {
          x += args[i++];
          y += args[i++];
          updateBounds(x, y);
          if (i === 2) { startX = x; startY = y; }
        }
        break;
      case 'L':
        while (i < args.length) {
          x = args[i++];
          y = args[i++];
          updateBounds(x, y);
        }
        break;
      case 'l':
        while (i < args.length) {
          x += args[i++];
          y += args[i++];
          updateBounds(x, y);
        }
        break;
      case 'H':
        while (i < args.length) {
          x = args[i++];
          updateBounds(x, y);
        }
        break;
      case 'h':
        while (i < args.length) {
          x += args[i++];
          updateBounds(x, y);
        }
        break;
      case 'V':
        while (i < args.length) {
          y = args[i++];
          updateBounds(x, y);
        }
        break;
      case 'v':
        while (i < args.length) {
          y += args[i++];
          updateBounds(x, y);
        }
        break;
      case 'C':
        while (i + 5 < args.length) {
          updateBounds(args[i], args[i + 1]);
          updateBounds(args[i + 2], args[i + 3]);
          x = args[i + 4];
          y = args[i + 5];
          updateBounds(x, y);
          i += 6;
        }
        break;
      case 'c':
        while (i + 5 < args.length) {
          updateBounds(x + args[i], y + args[i + 1]);
          updateBounds(x + args[i + 2], y + args[i + 3]);
          x += args[i + 4];
          y += args[i + 5];
          updateBounds(x, y);
          i += 6;
        }
        break;
      case 'S':
      case 's':
        while (i + 3 < args.length) {
          const isRel = type === 's';
          if (isRel) {
            updateBounds(x + args[i], y + args[i + 1]);
            x += args[i + 2];
            y += args[i + 3];
          } else {
            updateBounds(args[i], args[i + 1]);
            x = args[i + 2];
            y = args[i + 3];
          }
          updateBounds(x, y);
          i += 4;
        }
        break;
      case 'Q':
        while (i + 3 < args.length) {
          updateBounds(args[i], args[i + 1]);
          x = args[i + 2];
          y = args[i + 3];
          updateBounds(x, y);
          i += 4;
        }
        break;
      case 'q':
        while (i + 3 < args.length) {
          updateBounds(x + args[i], y + args[i + 1]);
          x += args[i + 2];
          y += args[i + 3];
          updateBounds(x, y);
          i += 4;
        }
        break;
      case 'T':
        while (i + 1 < args.length) {
          x = args[i++];
          y = args[i++];
          updateBounds(x, y);
        }
        break;
      case 't':
        while (i + 1 < args.length) {
          x += args[i++];
          y += args[i++];
          updateBounds(x, y);
        }
        break;
      case 'A':
        while (i + 6 < args.length) {
          x = args[i + 5];
          y = args[i + 6];
          updateBounds(x, y);
          i += 7;
        }
        break;
      case 'a':
        while (i + 6 < args.length) {
          x += args[i + 5];
          y += args[i + 6];
          updateBounds(x, y);
          i += 7;
        }
        break;
      case 'Z':
      case 'z':
        x = startX;
        y = startY;
        break;
    }
  }

  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Transform SVG to have a square viewBox centered on content
 */
function makeSquareAndResize(svgContent, filename) {
  // Extract current viewBox
  const viewBoxMatch = svgContent.match(/viewBox\s*=\s*["']([^"']+)["']/);
  if (!viewBoxMatch) {
    console.warn(`  Warning: No viewBox found in ${filename}, skipping`);
    return null;
  }

  const originalViewBox = parseViewBox(viewBoxMatch[1]);

  // Compute content bounds
  const contentBounds = computePathsBoundingBox(svgContent);
  if (!contentBounds) {
    console.warn(`  Warning: Could not compute bounds for ${filename}, using viewBox`);
    // Fall back to viewBox bounds
    contentBounds.minX = originalViewBox.minX;
    contentBounds.minY = originalViewBox.minY;
    contentBounds.maxX = originalViewBox.minX + originalViewBox.width;
    contentBounds.maxY = originalViewBox.minY + originalViewBox.height;
    contentBounds.width = originalViewBox.width;
    contentBounds.height = originalViewBox.height;
  }

  // Add small padding (2% of max dimension)
  const padding = Math.max(contentBounds.width, contentBounds.height) * 0.02;
  const paddedMinX = contentBounds.minX - padding;
  const paddedMinY = contentBounds.minY - padding;
  const paddedWidth = contentBounds.width + padding * 2;
  const paddedHeight = contentBounds.height + padding * 2;

  // Calculate the square that completely encloses the content
  const maxDim = Math.max(paddedWidth, paddedHeight);
  const centerX = paddedMinX + paddedWidth / 2;
  const centerY = paddedMinY + paddedHeight / 2;

  const squareMinX = centerX - maxDim / 2;
  const squareMinY = centerY - maxDim / 2;

  // Create new viewBox string
  const newViewBox = `${squareMinX.toFixed(2)} ${squareMinY.toFixed(2)} ${maxDim.toFixed(2)} ${maxDim.toFixed(2)}`;

  console.log(`  Original viewBox: ${viewBoxMatch[1]}`);
  console.log(`  Content bounds: ${contentBounds.minX.toFixed(1)}, ${contentBounds.minY.toFixed(1)} -> ${contentBounds.maxX.toFixed(1)}, ${contentBounds.maxY.toFixed(1)}`);
  console.log(`  New viewBox: ${newViewBox}`);

  // Replace viewBox in SVG
  let newSvg = svgContent.replace(/viewBox\s*=\s*["'][^"']+["']/, `viewBox="${newViewBox}"`);

  // Update width/height attributes to nominal size
  newSvg = newSvg.replace(/\bwidth\s*=\s*["'][^"']+["']/, `width="${NOMINAL_SIZE}"`);
  newSvg = newSvg.replace(/\bheight\s*=\s*["'][^"']+["']/, `height="${NOMINAL_SIZE}"`);

  // If width/height weren't present, add them
  if (!/\bwidth\s*=/.test(newSvg)) {
    newSvg = newSvg.replace(/<svg/, `<svg width="${NOMINAL_SIZE}"`);
  }
  if (!/\bheight\s*=/.test(newSvg)) {
    newSvg = newSvg.replace(/<svg/, `<svg height="${NOMINAL_SIZE}"`);
  }

  // Clean up: remove XML declaration and comments for consistency
  newSvg = newSvg.replace(/<\?xml[^?]*\?>\s*/g, '');
  newSvg = newSvg.replace(/<!--[\s\S]*?-->\s*/g, '');

  // Normalize whitespace
  newSvg = newSvg.trim() + '\n';

  return newSvg;
}

/**
 * Main processing
 */
function main() {
  console.log('Preparing icons...');
  console.log(`  Source: ${ORIGINALS_DIR}`);
  console.log(`  Output: ${OUTPUT_DIR}`);
  console.log(`  Nominal size: ${NOMINAL_SIZE}x${NOMINAL_SIZE}`);
  console.log('');

  const files = readdirSync(ORIGINALS_DIR).filter(f => f.endsWith('.svg'));

  for (const file of files) {
    console.log(`Processing: ${file}`);
    const inputPath = join(ORIGINALS_DIR, file);
    const outputPath = join(OUTPUT_DIR, file);

    const svgContent = readFileSync(inputPath, 'utf-8');
    const processed = makeSquareAndResize(svgContent, file);

    if (processed) {
      writeFileSync(outputPath, processed);
      console.log(`  Written: ${outputPath}`);
    }
    console.log('');
  }

  console.log('Done!');
}

main();
