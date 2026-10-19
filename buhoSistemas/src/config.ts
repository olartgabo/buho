import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Resolve .env from the package (src/ and dist/ both sit one level below it),
// not from cwd: MCP clients often spawn the server from another directory.
// The package .env is loaded first so it wins over the shared buho/.env.
const packageDir = fileURLToPath(new URL("..", import.meta.url));
loadEnv({ path: [join(packageDir, ".env"), join(packageDir, "..", ".env")] });

export function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`
    );
  }
  return value.trim();
}

export const config = {
  baseUrl: (process.env.UPBNET_BASE_URL || "https://sistemas.upb.edu").replace(/\/+$/, ""),
  downloadDir: process.env.DOWNLOAD_DIR || "./downloads",
  vaultDir: process.env.VAULT_DIR || "./vault",
  cacheDir: process.env.CACHE_DIR || "./.cache",
};
