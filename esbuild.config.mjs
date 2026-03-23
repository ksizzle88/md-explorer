import * as esbuild from "esbuild";
import { readFileSync } from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Build the webview bundle
await esbuild.build({
  entryPoints: ["src/webview/editor.tsx"],
  bundle: true,
  outdir: "out",
  entryNames: "webview",
  format: "iife",
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  minify: true,
  sourcemap: false,
  define: {
    "process.env.NODE_ENV": '"production"',
    global: "window",
  },
  loader: {
    ".css": "css",
    ".svg": "dataurl",
    ".png": "dataurl",
    ".jpg": "dataurl",
    ".jpeg": "dataurl",
    ".gif": "dataurl",
    ".webp": "dataurl",
    ".woff": "dataurl",
    ".woff2": "dataurl",
    ".ttf": "dataurl",
    ".eot": "dataurl",
  },
});

console.log("Webview bundle built successfully");
