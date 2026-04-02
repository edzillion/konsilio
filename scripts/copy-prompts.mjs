#!/usr/bin/env node
/**
 * Build script: Copy prompt files from src/prompts/ to data/prompts/
 * 
 * This ensures runtime prompt files are in the expected location
 * while keeping source files in src/ for development.
 */

import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const srcDir = join(rootDir, 'src', 'prompts');
const destDir = join(rootDir, 'data', 'prompts');

function copyDir(src, dest) {
  if (!existsSync(dest)) {
    mkdirSync(dest, { recursive: true });
  }
  
  const entries = readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

console.log('Copying prompts from src/prompts/ to data/prompts/...');
copyDir(srcDir, destDir);
console.log('Done!');