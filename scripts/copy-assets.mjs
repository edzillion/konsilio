#!/usr/bin/env node
/**
 * Build script: Copy static assets to build directory
 * 
 * Copies the following to build/:
 * - src/prompts/ -> build/prompts/
 * - konsilio.json -> build/konsilio.json
 * - konsilio.schema.json -> build/konsilio.schema.json
 */

import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');
const buildDir = join(rootDir, 'build');

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

function copyFile(src, dest) {
  copyFileSync(src, dest);
}

// Ensure build directory exists
if (!existsSync(buildDir)) {
  mkdirSync(buildDir, { recursive: true });
}

// Copy prompts
const srcPrompts = join(rootDir, 'src', 'prompts');
const destPrompts = join(buildDir, 'prompts');
console.log('Copying prompts from src/prompts/ to build/prompts/...');
copyDir(srcPrompts, destPrompts);

// Copy konsilio.json
const srcConfig = join(rootDir, 'konsilio.json');
const destConfig = join(buildDir, 'konsilio.json');
console.log('Copying konsilio.json to build/...');
copyFile(srcConfig, destConfig);

// Copy konsilio.schema.json
const srcSchema = join(rootDir, 'konsilio.schema.json');
const destSchema = join(buildDir, 'konsilio.schema.json');
console.log('Copying konsilio.schema.json to build/...');
copyFile(srcSchema, destSchema);

console.log('Done!');