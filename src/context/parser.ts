export interface ContextTag {
  type: 'file' | 'directory' | 'system';
  value: string;
  raw: string;
}

export function parseContextTags(input: string): { cleanInput: string; tags: ContextTag[] } {
  const tags: ContextTag[] = [];
  
  // Match @filename or @path/to/file for file injection
  const fileTagRegex = /@([\w./\-]+)/g;
  // Match #dirname or #system or #env or #git for directory/system context
  const dirTagRegex = /#([\w./\-]+)/g;

  let cleanInput = input;

  let match: RegExpExecArray | null;
  
  while ((match = fileTagRegex.exec(input)) !== null) {
    tags.push({
      type: 'file',
      value: match[1],
      raw: match[0]
    });
  }

  while ((match = dirTagRegex.exec(input)) !== null) {
    const value = match[1];
    const systemKeywords = ['system', 'env', 'git', 'os', 'pwd', 'cwd'];
    tags.push({
      type: systemKeywords.includes(value.toLowerCase()) ? 'system' : 'directory',
      value,
      raw: match[0]
    });
  }

  // Remove tags from input to get clean prompt
  cleanInput = input.replace(/@[\w./\-]+/g, '').replace(/#[\w./\-]+/g, '').trim();
  // Collapse multiple spaces
  cleanInput = cleanInput.replace(/\s+/g, ' ').trim();

  return { cleanInput, tags };
}
