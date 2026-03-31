import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { PluginApi, RegisteredTool } from "./types.js";
import { ToolRegistry } from "./registry.js";

export interface SiaPluginManifest {
  name: string;
  main: string;
}

export async function loadPluginDir(pluginRoot: string): Promise<ToolRegistry> {
  const reg = new ToolRegistry();
  const manifestPath = path.join(pluginRoot, "sia-plugin.json");
  if (!fs.existsSync(manifestPath)) return reg;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as SiaPluginManifest;
  if (!manifest.main || !manifest.name) return reg;

  const entry = path.resolve(pluginRoot, manifest.main);
  if (!fs.existsSync(entry)) return reg;

  const mod = await import(pathToFileURL(entry).href);
  const fn = mod.default ?? mod.register;
  if (typeof fn !== "function") return reg;

  const api: PluginApi = {
    registerTool(tool) {
      reg.register({ ...tool, source: `plugin:${manifest.name}` });
    },
  };

  await fn(api);
  return reg;
}

export async function discoverPlugins(globalDir: string, projectDir: string): Promise<ToolRegistry> {
  const merged = new ToolRegistry();

  const loadDirs = (base: string) => {
    if (!fs.existsSync(base)) return [] as string[];
    return fs
      .readdirSync(base, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(base, d.name));
  };

  for (const dir of loadDirs(globalDir)) {
    const r = await loadPluginDir(dir);
    merged.merge(r);
  }
  for (const dir of loadDirs(projectDir)) {
    const r = await loadPluginDir(dir);
    merged.merge(r);
  }

  return merged;
}
