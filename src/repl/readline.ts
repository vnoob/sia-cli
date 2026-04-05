import readline from "node:readline";

export function createRl(): readline.Interface {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}

export function question(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

/**
 * Run synchronous stdout writes while readline is paused so the next `question()` prompt
 * still accepts input correctly (paste and typing) on Windows / integrated terminals.
 */
export function withReadlineIdle(rl: readline.Interface, fn: () => void): void {
  rl.pause();
  try {
    fn();
  } finally {
    rl.resume();
  }
}

export async function readUserBlock(rl: readline.Interface): Promise<string> {
  const parts: string[] = [];
  while (true) {
    const line = await question(rl, parts.length === 0 ? "You> " : "...> ");
    const cont = line.endsWith("\\");
    const segment = cont ? line.slice(0, -1) : line;
    parts.push(segment);
    if (!cont) break;
  }
  return parts.join("\n");
}
