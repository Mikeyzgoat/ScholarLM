import { access } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const sglangVenv = resolve(root, ".venv-sglang-py311");
const sglangVenvPython = resolve(sglangVenv, "bin/python");
const children: Array<{ name: string; process: Bun.Subprocess }> = [];
let stopping = false;

async function isReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

async function executableExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function start(name: string, command: string[], cwd = root): Bun.Subprocess {
  console.log(`\n[ScholarLM] Starting ${name}: ${command.join(" ")}`);
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

async function commandSucceeds(command: string[]): Promise<boolean> {
  const result = Bun.spawn(command, {
    cwd: root,
    env: { ...Bun.env },
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
  return (await result.exited) === 0;
}

async function pythonVersion(python: string): Promise<string | null> {
  try {
    const result = Bun.spawn(
      [
        python,
        "-c",
        "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')",
      ],
      {
        cwd: root,
        env: { ...Bun.env },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "ignore",
      },
    );
    if ((await result.exited) !== 0) return null;
    return (await new Response(result.stdout).text()).trim();
  } catch {
    return null;
  }
}

function supportsSglang(version: string | null): boolean {
  if (!version) return false;
  const [major, minor] = version.split(".").map(Number);
  return major === 3 && minor >= 10 && minor <= 12;
}

async function runChecked(
  command: string[],
  failureMessage: string,
): Promise<void> {
  const result = Bun.spawn(command, {
    cwd: root,
    env: { ...Bun.env },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await result.exited) !== 0) throw new Error(failureMessage);
}

async function resolveSglangPython(): Promise<string> {
  if (Bun.env.SGLANG_PYTHON) {
    const configured = Bun.env.SGLANG_PYTHON.startsWith("/")
      ? Bun.env.SGLANG_PYTHON
      : resolve(root, Bun.env.SGLANG_PYTHON);
    const version = await pythonVersion(configured);
    if (!supportsSglang(version)) {
      throw new Error(
        `SGLANG_PYTHON must use Python 3.10-3.12; ${configured} reports ${version || "an unknown version"}.`,
      );
    }
    return configured;
  }

  if (
    (await executableExists(sglangVenvPython)) &&
    supportsSglang(await pythonVersion(sglangVenvPython))
  ) {
    return sglangVenvPython;
  }

  let basePython: string | undefined;
  for (const candidate of ["python3.11", "python3.12", "python3.10"]) {
    if (supportsSglang(await pythonVersion(candidate))) {
      basePython = candidate;
      break;
    }
  }
  if (!basePython) {
    throw new Error(
      "SGLang requires Python 3.10-3.12. Install Python 3.11, or set SGLANG_PYTHON to a compatible interpreter.",
    );
  }

  console.log(
    `\n[ScholarLM] Creating a compatible SGLang environment with ${basePython}…`,
  );
  await runChecked(
    [basePython, "-m", "venv", sglangVenv],
    `Could not create ${sglangVenv}. Ensure the ${basePython} venv package is installed.`,
  );
  await runChecked(
    [
      sglangVenvPython,
      "-m",
      "pip",
      "install",
      "--upgrade",
      "pip",
      "setuptools",
      "wheel",
    ],
    "Could not prepare the SGLang Python environment.",
  );
  return sglangVenvPython;
}

async function ensureSglang(python: string): Promise<void> {
  if (await commandSucceeds([python, "-c", "import sglang.launch_server"]))
    return;
  const packageName = Bun.env.SGLANG_PACKAGE || "sglang";
  console.log(
    `[ScholarLM] SGLang is missing from ${python}. Installing ${packageName}…`,
  );
  const installer = Bun.spawn(
    [python, "-m", "pip", "install", "--upgrade", packageName],
    {
      cwd: root,
      env: { ...Bun.env },
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const code = await installer.exited;
  if (code !== 0)
    throw new Error(
      `Could not install ${packageName}. Run '${python} -m pip install ${packageName}' and retry.`,
    );
  if (!(await commandSucceeds([python, "-c", "import sglang.launch_server"])))
    throw new Error(`${packageName} installed, but Python cannot import it.`);
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
  start("Ollama embeddings", ["ollama", "serve"]);
}

const sglangBaseUrl = (
  Bun.env.SGLANG_BASE_URL || "http://127.0.0.1:30000"
).replace(/\/$/, "");
if (await isReachable(`${sglangBaseUrl}/v1/models`)) {
  console.log(`[ScholarLM] Reusing SGLang at ${sglangBaseUrl}`);
} else {
  const python = await resolveSglangPython();
  await ensureSglang(python);
  const model = Bun.env.SGLANG_MODEL || "google/gemma-4-E2B-it";
  const memoryFraction = Bun.env.SGLANG_MEM_FRACTION || "0.82";
  start("SGLang inference", [
    python,
    "-m",
    "sglang.launch_server",
    "--model-path",
    model,
    "--host",
    "127.0.0.1",
    "--port",
    "30000",
    "--mem-fraction-static",
    memoryFraction,
  ]);
}

start("Bun backend", ["bun", "run", "dev"], resolve(root, "backend"));
start("Bun frontend", ["bun", "run", "dev"], resolve(root, "frontend"));

console.log(`
[ScholarLM] Development stack launched
  Frontend:  http://127.0.0.1:3000
  Backend:   http://127.0.0.1:3001
  SGLang:    ${sglangBaseUrl}
  Ollama:    ${ollamaBaseUrl}

Press Ctrl+C once to stop services started by this script.
`);

const exits = children.map(async (child) => ({
  name: child.name,
  code: await child.process.exited,
}));
const firstExit = await Promise.race(exits);
if (!stopping) {
  console.error(
    `[ScholarLM] ${firstExit.name} exited with code ${firstExit.code}.`,
  );
  await stop(firstExit.code || 1);
}
