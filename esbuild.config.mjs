import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/webview/editor.tsx"],
  bundle: true,
  outfile: "out/webview.js",
  format: "iife",
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  minify: true,
  sourcemap: false,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

console.log("Webview bundle built successfully");
