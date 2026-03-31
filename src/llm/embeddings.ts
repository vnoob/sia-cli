function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export async function fetchEmbedding(opts: {
  baseURL: string;
  apiKey?: string;
  model: string;
  input: string;
  signal?: AbortSignal;
}): Promise<number[]> {
  const url = `${trimTrailingSlash(opts.baseURL)}/embeddings`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: opts.model, input: opts.input }),
    signal: opts.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Embeddings failed ${res.status}: ${text.slice(0, 400)}`);
  }

  const json = (await res.json()) as {
    data?: { embedding?: number[] }[];
  };
  const emb = json.data?.[0]?.embedding;
  if (!emb?.length) throw new Error("No embedding in response");
  return emb;
}
