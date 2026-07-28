import tailwind from "bun-plugin-tailwind";
import { rmSync } from "node:fs";

const outputDirectory = new URL("./dist", import.meta.url);
rmSync(outputDirectory, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["./index.html"],
  outdir: outputDirectory.pathname,
  minify: true,
  plugins: [tailwind],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

console.log(`Built ${result.outputs.length} frontend assets.`);
