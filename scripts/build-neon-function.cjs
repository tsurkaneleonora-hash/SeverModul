"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const esbuild = require("esbuild");

const projectRoot = path.resolve(__dirname, "..");
const outputDirectory = path.join(projectRoot, "dist", "neon-function");
const bundlePath = path.join(outputDirectory, "index.mjs");
const archivePath = path.join(projectRoot, "dist", "severmodul-neon-function.zip");
const nodeGlobalsBanner =
  "import{createRequire as ___cr}from'module';import{fileURLToPath as ___f}from'url';import{dirname as ___d}from'path';const require=___cr(import.meta.url);const __filename=___f(import.meta.url);const __dirname=___d(__filename);";

async function main() {
  fs.mkdirSync(outputDirectory, { recursive: true });

  await esbuild.build({
    entryPoints: [path.join(projectRoot, "src", "index.ts")],
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    banner: { js: nodeGlobalsBanner },
    outfile: bundlePath,
    packages: "bundle",
    sourcemap: false,
    minify: false,
    logLevel: "info"
  });

  const smokeCode =
    `import assert from "node:assert/strict"; ` +
    `import { pathToFileURL } from "node:url"; ` +
    `const handler = (await import(${JSON.stringify(
      require("node:url").pathToFileURL(bundlePath).href
    )})).default; ` +
    `assert.equal(typeof handler.fetch, "function"); ` +
    `for (const [request, status] of [[new Request("https://function.test/", { method: "POST" }), 405], ` +
    `[new Request("https://function.test/"), 400], ` +
    `[new Request("https://function.test/?action=history"), 400], ` +
    `[new Request("https://function.test/?q=test"), 500]]) { ` +
    `const response = await handler.fetch(request); ` +
    `assert.equal(response.status, status); ` +
    `assert.match(response.headers.get("content-type") || "", /application\\/json/u); ` +
    `}`;
  const smokeResult = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", smokeCode],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
        SystemRoot: process.env.SystemRoot ?? ""
      }
    }
  );
  if (smokeResult.status !== 0) {
    throw new Error(smokeResult.stderr.trim() || "Neon function bundle smoke test failed");
  }

  const zipCommand =
    "$ErrorActionPreference = 'Stop'; " +
    `Compress-Archive -LiteralPath '${path.relative(projectRoot, bundlePath)}' ` +
    `-DestinationPath '${path.relative(projectRoot, archivePath)}' -Force`;
  const zipResult = spawnSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", zipCommand],
    { cwd: projectRoot, encoding: "utf8" }
  );
  if (zipResult.status !== 0) {
    throw new Error(zipResult.stderr.trim() || "Could not create Neon function archive");
  }

  const listing = spawnSync("tar.exe", ["-tf", archivePath], {
    cwd: projectRoot,
    encoding: "utf8"
  });
  if (listing.status !== 0) {
    throw new Error(listing.stderr.trim() || "Could not inspect Neon function archive");
  }
  const entries = listing.stdout.trim().split(/\r?\n/u);
  if (entries.length !== 1 || entries[0] !== "index.mjs") {
    throw new Error(`Unexpected Neon archive structure: ${entries.join(", ")}`);
  }

  console.log(`Neon function bundle: ${path.relative(projectRoot, bundlePath)}`);
  console.log(`Neon function archive: ${path.relative(projectRoot, archivePath)}`);
  console.log(`Archive entry: ${entries[0]}`);
  console.log("Node.js 24 bundle smoke test passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Neon function build failed");
  process.exitCode = 1;
});
