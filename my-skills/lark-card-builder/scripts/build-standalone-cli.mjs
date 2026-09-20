#!/usr/bin/env node

import { chmod, readFile } from "node:fs/promises";

import { build } from "esbuild";

const manifestUrl = new URL("../docs/snapshot.json", import.meta.url);
const outputUrl = new URL("./lark-card.mjs", import.meta.url);
const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

await build({
  entryPoints: [new URL("../src/cli.ts", import.meta.url).pathname],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: outputUrl.pathname,
  define: {
    __LARK_CARD_DOCUMENTATION_SNAPSHOT__: JSON.stringify(manifest),
  },
});

await chmod(outputUrl, 0o755);
