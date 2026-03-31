export type MentionKind = "env" | "file" | "hash";

export interface ParsedMention {
  kind: MentionKind;
  raw: string;
  /** env var name for kind env */
  envName?: string;
  /** path or #token without leading # */
  target?: string;
}

export function parseMentions(input: string): ParsedMention[] {
  const seen = new Set<string>();
  const out: ParsedMention[] = [];

  const envRe = /@env:([A-Za-z_][A-Za-z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = envRe.exec(input)) !== null) {
    const raw = m[0];
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push({ kind: "env", raw, envName: m[1] });
  }

  const fileRe = /@([^\s@]+)/g;
  while ((m = fileRe.exec(input)) !== null) {
    const raw = m[0];
    if (raw.startsWith("@env:")) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push({ kind: "file", raw, target: m[1] });
  }

  const hashRe = /#(last|session|[a-zA-Z0-9_-]+)/g;
  while ((m = hashRe.exec(input)) !== null) {
    const raw = m[0];
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push({ kind: "hash", raw, target: m[1] });
  }

  return out;
}
