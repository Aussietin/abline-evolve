// Tiny ESM resolve hook so `node scripts/sim-tests.ts` can import the app's
// existing extensionless relative specifiers (e.g. `from "./types"`) without
// editing any src/ file to satisfy Node's native ESM resolver — Vite/tsc
// already resolve those fine; only a bare `node` run needs the nudge.
// Node 24 strips TS syntax natively, so this hook only has to fix
// resolution, not transpile anything.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (specifier.startsWith(".") && !/\.[a-zA-Z0-9]+$/.test(specifier)) {
      const candidate = new URL(specifier + ".ts", context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        return nextResolve(pathToFileURL(fileURLToPath(candidate)).href, context);
      }
    }
    throw err;
  }
}
