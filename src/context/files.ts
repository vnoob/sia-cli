import * as fs from 'fs';
import * as path from 'path';
import { ContextTag } from './parser';

export interface ContextContent {
  tag: ContextTag;
  content: string;
  error?: string;
}

const MAX_FILE_PREVIEW_LINES = 200;

export function resolveFilePath(value: string): string {
  if (path.isAbsolute(value)) return value;
  return path.resolve(process.cwd(), value);
}

export function readFileContext(tag: ContextTag): ContextContent {
  const filePath = resolveFilePath(tag.value);
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return { tag, content: '', error: `${filePath} is not a file` };
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const preview = lines.length > MAX_FILE_PREVIEW_LINES ? lines.slice(0, MAX_FILE_PREVIEW_LINES).join('\n') + '\n... (truncated)' : content;
    return { tag, content: `File: ${filePath}\n\`\`\`\n${preview}\n\`\`\`` };
  } catch (err: any) {
    return { tag, content: '', error: `Cannot read ${filePath}: ${err.message}` };
  }
}

export function readDirectoryContext(tag: ContextTag): ContextContent {
  const dirPath = resolveFilePath(tag.value);
  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return { tag, content: '', error: `${dirPath} is not a directory` };
    }
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const tree = entries
      .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
      .map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`)
      .join('\n');
    return { tag, content: `Directory: ${dirPath}\n${tree}` };
  } catch (err: any) {
    return { tag, content: '', error: `Cannot read directory ${dirPath}: ${err.message}` };
  }
}

export function buildContextBlock(contents: ContextContent[]): string {
  const valid = contents.filter(c => !c.error && c.content);
  const errors = contents.filter(c => c.error);
  
  let block = '';
  if (valid.length > 0) {
    block += '\n\n--- CONTEXT ---\n';
    block += valid.map(c => c.content).join('\n\n');
    block += '\n--- END CONTEXT ---';
  }
  if (errors.length > 0) {
    block += '\n\n[Context warnings: ' + errors.map(e => e.error).join('; ') + ']';
  }
  return block;
}
