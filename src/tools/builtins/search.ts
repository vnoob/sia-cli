import { Tool } from '../types';
import * as fs from 'fs';
import * as path from 'path';

const MAX_SEARCH_DEPTH = 5;
const MAX_RESULTS = 50;

export const searchTool: Tool = {
  name: 'search',
  description: 'Search for text patterns in files',
  async execute(args: string[]): Promise<string> {
    if (args.length < 1) {
      return 'Error: Usage: search <pattern> [directory]';
    }
    const pattern = args[0];
    const searchDir = args[1] || process.cwd();
    const results: string[] = [];

    function searchInFile(filePath: string): void {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (line.toLowerCase().includes(pattern.toLowerCase())) {
            results.push(`${filePath}:${index + 1}: ${line.trim()}`);
          }
        });
      } catch {
        // Skip unreadable files
      }
    }

    function walkDir(dir: string, depth = 0): void {
      if (depth > MAX_SEARCH_DEPTH) return;
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walkDir(fullPath, depth + 1);
          } else if (entry.isFile()) {
            searchInFile(fullPath);
          }
        }
      } catch {
        // Skip unreadable dirs
      }
    }

    walkDir(searchDir);
    if (results.length === 0) {
      return `No matches found for "${pattern}" in ${searchDir}`;
    }
    return results.slice(0, MAX_RESULTS).join('\n') + (results.length > MAX_RESULTS ? `\n... and ${results.length - MAX_RESULTS} more matches` : '');
  }
};
