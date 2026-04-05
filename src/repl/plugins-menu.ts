import type readline from "node:readline";
import {
  listAvailablePlugins,
  buildPluginInfo,
  type PluginInfo,
  type ToolRegistry,
} from "../plugins/index.js";
import { question, withReadlineIdle } from "./readline.js";

export interface PluginsMenuOptions {
  rl: readline.Interface;
  globalPluginsDir: string;
  projectPluginsDir: string;
  tools: ToolRegistry;
  noPlugins: boolean;
}

export async function runPluginsMenu(opts: PluginsMenuOptions): Promise<void> {
  const available = listAvailablePlugins(opts.globalPluginsDir, opts.projectPluginsDir);
  const toolList = opts.tools.list();
  const plugins = buildPluginInfo(available, toolList, opts.noPlugins);

  const builtinCount = toolList.filter((t) => t.source === "builtin").length;

  while (true) {
    withReadlineIdle(opts.rl, () => {
      console.log("\n=== Plugins ===\n");

      if (opts.noPlugins) {
        console.log("  (Plugins disabled with --no-plugins)\n");
      }

      console.log(`  Built-in tools: ${builtinCount}`);
      console.log("");

      if (plugins.length === 0) {
        console.log("  No plugins found.");
        console.log(`  Global: ${opts.globalPluginsDir}`);
        console.log(`  Project: ${opts.projectPluginsDir}`);
        console.log("");
      } else {
        for (let i = 0; i < plugins.length; i++) {
          const p = plugins[i];
          const status = p.loaded ? "[loaded]" : p.error ? "[error]" : "[not loaded]";
          const toolInfo = p.loaded ? ` (${p.toolCount} tool${p.toolCount !== 1 ? "s" : ""})` : "";
          const scopeTag = p.scope === "project" ? " [project]" : "";
          console.log(`  ${i + 1}. ${p.name}${scopeTag} ${status}${toolInfo}`);
        }
        console.log("");
      }

      console.log("  b. Show built-in tools");
      console.log("  0. Back\n");
    });

    const choice = await question(opts.rl, "Choice [0]: ");
    const trimmed = choice.trim().toLowerCase();

    if (trimmed === "" || trimmed === "0") {
      return;
    }

    if (trimmed === "b") {
      await showBuiltinTools(opts.rl, toolList);
      continue;
    }

    const num = parseInt(trimmed, 10);
    if (num >= 1 && num <= plugins.length) {
      await showPluginDetail(opts.rl, plugins[num - 1], toolList);
      continue;
    }

    withReadlineIdle(opts.rl, () => console.log("Invalid choice."));
  }
}

async function showBuiltinTools(
  rl: readline.Interface,
  toolList: Array<{ name: string; source?: string; description: string }>,
): Promise<void> {
  const builtins = toolList.filter((t) => t.source === "builtin");

  withReadlineIdle(rl, () => {
    console.log("\n--- Built-in Tools ---\n");
    if (builtins.length === 0) {
      console.log("  No built-in tools.");
    } else {
      for (const tool of builtins) {
        console.log(`  ${tool.name}`);
        console.log(`    ${tool.description}\n`);
      }
    }
  });

  await question(rl, "Press Enter to continue...");
}

async function showPluginDetail(
  rl: readline.Interface,
  plugin: PluginInfo,
  toolList: Array<{ name: string; source?: string; description: string }>,
): Promise<void> {
  const pluginTools = toolList.filter((t) => t.source === `plugin:${plugin.name}`);

  withReadlineIdle(rl, () => {
    console.log(`\n--- Plugin: ${plugin.name} ---\n`);
    console.log(`  Directory: ${plugin.dir}`);
    console.log(`  Scope: ${plugin.scope}`);
    console.log(`  Status: ${plugin.loaded ? "Loaded" : plugin.error ? `Error — ${plugin.error}` : "Not loaded"}`);
    console.log("");

    if (pluginTools.length > 0) {
      console.log(`  Tools (${pluginTools.length}):\n`);
      for (const tool of pluginTools) {
        console.log(`    ${tool.name}`);
        const desc = tool.description.length > 80 ? tool.description.slice(0, 77) + "..." : tool.description;
        console.log(`      ${desc}\n`);
      }
    } else if (plugin.loaded) {
      console.log("  No tools registered by this plugin.");
    } else if (!plugin.error) {
      console.log("  (Plugin not loaded — tools not available)");
    }
  });

  await question(rl, "Press Enter to continue...");
}
