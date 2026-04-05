import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, saveConfig } from "./load.js";
import { defaultConfig, type SiaConfig } from "./types.js";

describe("saveConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sia-config-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes config to a new file", () => {
    const configPath = path.join(tmpDir, "config.json");
    const config: SiaConfig = {
      ...structuredClone(defaultConfig),
      defaultProvider: "openai",
    };
    saveConfig(configPath, config);

    const loaded = JSON.parse(fs.readFileSync(configPath, "utf8"));
    expect(loaded.defaultProvider).toBe("openai");
  });

  it("overwrites existing config", () => {
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({ defaultProvider: "old" }), "utf8");

    const config: SiaConfig = {
      ...structuredClone(defaultConfig),
      defaultProvider: "new",
    };
    saveConfig(configPath, config);

    const loaded = JSON.parse(fs.readFileSync(configPath, "utf8"));
    expect(loaded.defaultProvider).toBe("new");
  });

  it("round-trips with loadConfig", () => {
    const configPath = path.join(tmpDir, "config.json");
    const config: SiaConfig = {
      ...structuredClone(defaultConfig),
      defaultProvider: "gemini",
      providers: {
        ...structuredClone(defaultConfig).providers,
        gemini: {
          type: "openai-compatible",
          baseURL: "https://example.com/v1",
          model: "gemini-2.5-flash",
          apiKeyEnv: "GEMINI_API_KEY",
        },
      },
    };
    saveConfig(configPath, config);
    const loaded = loadConfig(configPath);

    expect(loaded.defaultProvider).toBe("gemini");
    expect(loaded.providers.gemini?.baseURL).toBe("https://example.com/v1");
  });
});
