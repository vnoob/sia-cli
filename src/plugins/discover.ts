import fs from "node:fs";
import path from "node:path";
import type { SiaPluginManifest } from "./loader.js";

export interface PluginInfo {
  name: string;
  dir: string;
  scope: "global" | "project";
  loaded: boolean;
  error?: string;
  toolCount: number;
  tools: string[];
}

export interface AvailablePlugin {
  name: string;
  dir: string;
  scope: "global" | "project";
  manifest: SiaPluginManifest | null;
  error?: string;
}

/**
 * Scan plugin directories and return info about each plugin found.
 * Does NOT load the plugins — just reads manifests.
 */
export function listAvailablePlugins(globalDir: string, projectDir: string): AvailablePlugin[] {
  const results: AvailablePlugin[] = [];

  const scanDir = (base: string, scope: "global" | "project") => {
    if (!fs.existsSync(base)) return;
    const entries = fs.readdirSync(base, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(base, entry.name);
      const manifestPath = path.join(dir, "sia-plugin.json");

      if (!fs.existsSync(manifestPath)) {
        results.push({
          name: entry.name,
          dir,
          scope,
          manifest: null,
          error: "Missing sia-plugin.json",
        });
        continue;
      }

      try {
        const raw = fs.readFileSync(manifestPath, "utf8");
        const manifest = JSON.parse(raw) as SiaPluginManifest;

        if (!manifest.name || !manifest.main) {
          results.push({
            name: entry.name,
            dir,
            scope,
            manifest: null,
            error: "Invalid manifest: missing name or main",
          });
          continue;
        }

        const entryPath = path.resolve(dir, manifest.main);
        if (!fs.existsSync(entryPath)) {
          results.push({
            name: manifest.name,
            dir,
            scope,
            manifest,
            error: `Entry file not found: ${manifest.main}`,
          });
          continue;
        }

        results.push({
          name: manifest.name,
          dir,
          scope,
          manifest,
        });
      } catch (e) {
        results.push({
          name: entry.name,
          dir,
          scope,
          manifest: null,
          error: `Failed to parse manifest: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
  };

  scanDir(globalDir, "global");
  scanDir(projectDir, "project");

  return results;
}

/**
 * Build full plugin info by combining available plugins with loaded tool registry.
 */
export function buildPluginInfo(
  available: AvailablePlugin[],
  loadedTools: Array<{ name: string; source?: string; description: string }>,
  noPlugins: boolean,
): PluginInfo[] {
  const toolsByPlugin = new Map<string, Array<{ name: string; description: string }>>();

  for (const tool of loadedTools) {
    if (!tool.source?.startsWith("plugin:")) continue;
    const pluginName = tool.source.slice("plugin:".length);
    if (!toolsByPlugin.has(pluginName)) {
      toolsByPlugin.set(pluginName, []);
    }
    toolsByPlugin.get(pluginName)!.push({ name: tool.name, description: tool.description });
  }

  return available.map((p) => {
    const pluginTools = toolsByPlugin.get(p.name) ?? [];
    const loaded = !noPlugins && !p.error && pluginTools.length > 0;

    return {
      name: p.name,
      dir: p.dir,
      scope: p.scope,
      loaded,
      error: noPlugins ? "Plugins disabled (--no-plugins)" : p.error,
      toolCount: pluginTools.length,
      tools: pluginTools.map((t) => t.name),
    };
  });
}
