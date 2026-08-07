import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

export function resolveSupplyDir() {
  const fromEnv = String(process.env.SUPPLY_DATA_DIR || "").trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.resolve(PROJECT_ROOT, fromEnv);
  }
  return path.join(PROJECT_ROOT, "data", "supply");
}

export function listSupplySourceFiles(dir = resolveSupplyDir()) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /\.(csv|txt|json|db|sqlite)$/i.test(name))
    .map((name) => {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      return {
        name,
        path: full,
        ext: path.extname(name).toLowerCase(),
        mtimeMs: st.mtimeMs,
        size: st.size,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Papka + fayllar o‘zgarganini aniqlash */
export function supplyDirSignature(dir = resolveSupplyDir()) {
  const files = listSupplySourceFiles(dir);
  if (!files.length) return `missing:${dir}`;
  return files.map((f) => `${f.name}:${f.mtimeMs}:${f.size}`).join("|");
}
