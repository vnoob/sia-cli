import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** `{uuid}_{milliseconds}.db` from crypto.randomUUID() + Date.now(). */
const AGENT_DB_NAME_RE =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_(\d+)\.db$/i;

export function isAgentContextFileName(name: string): boolean {
  return AGENT_DB_NAME_RE.test(name);
}

export function parseAgentContextFileName(name: string): { uuid: string; timestamp: number } | null {
  const m = name.match(AGENT_DB_NAME_RE);
  if (!m) return null;
  return { uuid: m[1], timestamp: Number(m[2]) };
}

export function createAgentDbFileName(): string {
  return `${crypto.randomUUID()}_${Date.now()}.db`;
}

/** Absolute paths to agent context DBs, newest timestamp first (then name). */
export function listAgentContextPaths(contextsDir: string): string[] {
  if (!fs.existsSync(contextsDir)) return [];
  const names = fs.readdirSync(contextsDir);
  const paths: { abs: string; ts: number; name: string }[] = [];
  for (const name of names) {
    if (!isAgentContextFileName(name)) continue;
    const p = parseAgentContextFileName(name);
    if (!p) continue;
    paths.push({ abs: path.join(contextsDir, name), ts: p.timestamp, name });
  }
  paths.sort((a, b) => b.ts - a.ts || a.name.localeCompare(b.name));
  return paths.map((x) => x.abs);
}
