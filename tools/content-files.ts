import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/** Every regular file under `dir`, relative to `root`, skipping README.md files. Missing dirs yield nothing. */
export function listFiles(root: string, dir: string): string[] {
  const found: string[] = [];
  const walk = (relative: string) => {
    let entries;
    try {
      entries = readdirSync(path.join(root, relative), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) {
        walk(child);
      } else if (entry.isFile() && entry.name !== 'README.md') {
        found.push(child);
      }
    }
  };
  walk(dir);
  return found.sort();
}

/** True when a file's bytes begin an X12 interchange (an ISA segment, after an optional BOM). */
export function isX12Interchange(file: string): boolean {
  const head = readFileSync(file).subarray(0, 8).toString('latin1');
  return head.replace(/^ï»¿/, '').startsWith('ISA');
}

export const repositoryRoot = path.resolve(import.meta.dirname, '..');
