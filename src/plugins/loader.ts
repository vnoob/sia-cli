import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { getLogger } from "../logging.js";
import type { PluginApi, RegisteredTool } from "./types.js";
import { ToolRegistry } from "./registry.js";

export interface SiaPluginManifest {
  name: string;
  main: string;
}

export async function loadPluginDir(pluginRoot: string): Promise<ToolRegistry> {
  const log = getLogger();
  const reg = new ToolRegistry();
  const manifestPath = path.join(pluginRoot, "sia-plugin.json");
  if (!fs.existsSync(manifestPath)) return reg;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as SiaPluginManifest;
  if (!manifest.main || !manifest.name) {
    log.warn("plugin", `Invalid manifest in ${pluginRoot}`, { manifest });
    return reg;
  }

  const entry = path.resolve(pluginRoot, manifest.main);
  if (!fs.existsSync(entry)) {
    log.warn("plugin", `Entry file not found: ${entry}`);
    return reg;
  }

  try {
    const mod = await import(pathToFileURL(entry).href);
    const fn = mod.default ?? mod.register;
    if (typeof fn !== "function") {
      log.warn("plugin", `No register function in ${entry}`);
      return reg;
    }

    const api: PluginApi = {
      registerTool(tool) {
        reg.register({ ...tool, source: `plugin:${manifest.name}` });
        log.debug("plugin", `Registered tool: ${tool.name}`, { plugin: manifest.name });
      },
    };

    await fn(api);
    log.info("plugin", `Loaded plugin: ${manifest.name}`, { tools: reg.list().length, dir: pluginRoot });
  } catch (e) {
    log.error("plugin", `Failed to load plugin: ${manifest.name}`, { error: e instanceof Error ? e.message : String(e) });
  }

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
