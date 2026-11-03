import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const relative = specifier.slice(2);
    const basePath = path.resolve(process.cwd(), "src", relative);
    const candidates = [
      basePath,
      basePath + ".ts",
      basePath + ".tsx",
      basePath + ".js",
      path.join(basePath, "index.ts"),
      path.join(basePath, "index.js"),
    ];
    for (const cand of candidates) {
      if (fs.existsSync(cand)) {
        return nextResolve(pathToFileURL(cand).href, context);
      }
    }
    // Fallback: try with .ts extension even if file doesn't exist yet, let nextResolve handle error
    const fallback = basePath + ".ts";
    return nextResolve(pathToFileURL(fallback).href, context);
  }
  return nextResolve(specifier, context);
}
