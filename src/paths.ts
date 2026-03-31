import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** Override with `SIA_HOME`. */
export function getSiaHome(): string {
  const env = process.env.SIA_HOME?.trim();
  if (env) return path.resolve(env);
  if (process.platform === "win32") {
    const base = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    return path.join(base, "sia-cli");
  }
  const xdg = process.env.XDG_DATA_HOME?.trim();
  if (xdg) return path.join(path.resolve(xdg), "sia-cli");
  return path.join(os.homedir(), ".local", "share", "sia-cli");
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function defaultConfigPath(home = getSiaHome()): string {
  return path.join(home, "config.json");
}

/** Directory for per-agent SQLite context files (under SIA_HOME by default). */
export function defaultContextsDir(home = getSiaHome()): string {
  return path.join(home, "contexts");
}

export function globalPluginsDir(home = getSiaHome()): string {
  return path.join(home, "plugins");
}

export function projectPluginsDir(cwd = process.cwd()): string {
  return path.join(cwd, ".sia", "plugins");
}
