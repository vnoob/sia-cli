import { describe, expect, it } from "vitest";
import { ToolRegistry } from "./registry.js";

describe("ToolRegistry", () => {
  it("merges and overwrites by name", () => {
    const a = new ToolRegistry();
    a.register({
      name: "t1",
      description: "a",
      parameters: { type: "object" },
      async handler() {
        return "a";
      },
    });
    const b = new ToolRegistry();
    b.register({
      name: "t1",
      description: "b",
      parameters: { type: "object" },
      async handler() {
        return "b";
      },
    });
    a.merge(b);
    expect(a.list()).toHaveLength(1);
    expect(a.list()[0].description).toBe("b");
  });

  it("toOpenAITools maps names", () => {
    const r = new ToolRegistry();
    r.register({
      name: "x",
      description: "d",
      parameters: { type: "object", properties: {} },
      async handler() {
        return "{}";
      },
    });
    const tools = r.toOpenAITools();
    expect(tools[0].function.name).toBe("x");
  });
});
