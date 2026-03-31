const DEFAULT_MAX = 800;

export function chunkText(text: string, maxChars = DEFAULT_MAX): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const parts: string[] = [];
  let buf = "";
  for (const para of normalized.split(/\n{2,}/)) {
    const lines = para.split("\n");
    for (const line of lines) {
      if (buf.length + line.length + 1 > maxChars && buf.length > 0) {
        parts.push(buf.trim());
        buf = line;
      } else {
        buf = buf ? `${buf}\n${line}` : line;
      }
      while (buf.length > maxChars) {
        parts.push(buf.slice(0, maxChars).trim());
        buf = buf.slice(maxChars);
      }
    }
    if (buf.length > 0) {
      parts.push(buf.trim());
      buf = "";
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts.filter((p) => p.length > 0);
}
