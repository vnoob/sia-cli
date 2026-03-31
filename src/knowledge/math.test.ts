import { describe, expect, it } from "vitest";
import { bufferToEmbedding, cosineSimilarity, embeddingToBuffer } from "./math.js";

describe("embedding math", () => {
  it("roundtrips buffer", () => {
    const v = [1, 2, 3, 0.5];
    const buf = embeddingToBuffer(v);
    const back = bufferToEmbedding(buf);
    expect(back).toEqual(v);
  });

  it("cosine is 1 for identical vectors", () => {
    const v = [1, 0, 0];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1);
  });

  it("cosine is 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
});
