import { describe, expect, it } from "vitest";
import { parseMentions } from "./parse.js";

describe("parseMentions", () => {
  it("parses @env, @file, and #refs", () => {
    const m = parseMentions("Hi @env:PATH and @src/foo.txt #last #session #note-1");
    const kinds = m.map((x) => x.kind);
    expect(kinds).toContain("env");
    expect(kinds).toContain("file");
    expect(m.filter((x) => x.kind === "env")[0].envName).toBe("PATH");
    expect(m.filter((x) => x.kind === "file")[0].target).toBe("src/foo.txt");
    const hashes = m.filter((x) => x.kind === "hash").map((x) => x.target);
    expect(hashes).toEqual(["last", "session", "note-1"]);
  });

  it("dedupes repeated mentions", () => {
    const m = parseMentions("@a.txt @a.txt");
    expect(m.filter((x) => x.kind === "file")).toHaveLength(1);
  });
});
