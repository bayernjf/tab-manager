import { copyFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const envPath = resolve(root, ".env.local");
const outputPath = resolve(root, "dist/supabase-config.js");

function parseEnv(source) {
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

let env;
try {
  env = parseEnv(await readFile(envPath, "utf8"));
} catch {
  throw new Error("缺少 .env.local，请复制 .env.example 并填写 Supabase 配置");
}

const url = env.SUPABASE_URL;
const anonKey = env.SUPABASE_ANON_KEY;
if (!url || !anonKey) throw new Error(".env.local 必须包含 SUPABASE_URL 和 SUPABASE_ANON_KEY");
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) throw new Error("SUPABASE_URL 格式不正确");

let output = await readFile(outputPath, "utf8");
output = output
  .replace('"https://YOUR_PROJECT.supabase.co"', JSON.stringify(url.replace(/\/$/, "")))
  .replace('"YOUR_SUPABASE_ANON_KEY"', JSON.stringify(anonKey));
await writeFile(outputPath, output);

await Promise.all([
  copyFile(resolve(root, "src/options.html"), resolve(root, "dist/options.html")),
  copyFile(resolve(root, "src/options.css"), resolve(root, "dist/options.css")),
]);
