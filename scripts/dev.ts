import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const children: Array<{ name: string; process: Bun.Subprocess }> = [];
let stopping = false;

async function isReachable(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1200) })).ok;
  } catch {
    return false;
  }
}

function start(name: string, command: string[], cwd = root): Bun.Subprocess {
  console.log(`\n[ScholarLM] Starting ${name}`);
  const child = Bun.spawn(command, {
    cwd,
    env: { ...Bun.env },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  children.push({ name, process: child });
  return child;
}

async function stop(exitCode = 0): Promise<never> {
  if (stopping) process.exit(exitCode);
  stopping = true;
  console.log("\n[ScholarLM] Stopping development services…");
  for (const child of children) {
    try {
      child.process.kill("SIGTERM");
    } catch {
      // The child already exited.
    }
  }
  await Promise.allSettled(children.map((child) => child.process.exited));
  process.exit(exitCode);
}

process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

const ollamaBaseUrl = (
  Bun.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434"
).replace(/\/$/, "");

if (await isReachable(`${ollamaBaseUrl}/api/tags`)) {
  console.log(`[ScholarLM] Reusing Ollama at ${ollamaBaseUrl}`);
} else {
  start("Ollama", ["ollama", "serve"]);
}

start("Bun backend", ["bun", "run", "dev"], resolve(root, "backend"));
start("Bun frontend", ["bun", "run", "dev"], resolve(root, "frontend"));

console.log(`
[ScholarLM] Development stack launched
  Frontend: http://127.0.0.1:3000
  Backend:  http://127.0.0.1:3001
  Ollama:   ${ollamaBaseUrl}

Press Ctrl+C once to stop.
`);

const firstExit = await Promise.race(
  children.map(async (child) => ({
    name: child.name,
    code: await child.process.exited,
  })),
);

if (!stopping) {
  console.error(
    `[ScholarLM] ${firstExit.name} exited with code ${firstExit.code}.`,
  );
  await stop(firstExit.code || 1);
}
