import tailwind from "bun-plugin-tailwind";
import { cpSync, rmSync } from "node:fs";

const outputDirectory = new URL("./dist", import.meta.url);
rmSync(outputDirectory, { recursive: true, force: true });

const result = await Bun.build({
  entrypoints: ["./index.html"],
  outdir: outputDirectory.pathname,
  publicPath: "/",
  minify: true,
  define: {
    SCHOLARLM_API_BASE_URL: JSON.stringify(
      process.env.API_BASE_URL ?? "http://localhost:3001",
    ),
  },
  plugins: [tailwind],
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  process.exit(1);
}

cpSync(new URL("./public", import.meta.url), outputDirectory, {
  recursive: true,
});

console.log(`Built ${result.outputs.length} frontend assets.`);
