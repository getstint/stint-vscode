const watch = process.argv.includes("--watch");

async function build() {
  const result = await Bun.build({
    entrypoints: ["src/extension.ts"],
    outdir: "dist",
    naming: "extension.js",
    target: "node",
    format: "cjs",
    external: ["vscode"],
    minify: !watch,
    sourcemap: watch ? "inline" : "none",
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    if (!watch) process.exit(1);
    return;
  }
  console.info(`Built dist/extension.js (${(result.outputs[0].size / 1024).toFixed(1)} KB)`);
}

await build();
if (watch) {
  const { watch: watchDir } = await import("node:fs");
  watchDir("src", { recursive: true }, () => void build());
}

export {};
