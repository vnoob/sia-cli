import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk.js";

describe("chunkText", () => {
  it("splits long text", () => {
    const s = "x".repeat(2000);
    const c = chunkText(s, 500);
    expect(c.length).toBeGreaterThan(1);
    expect(c.every((p) => p.length <= 500)).toBe(true);
  });
});
