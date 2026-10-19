import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { config } from "../config.js";

/** Sanitise a path segment for safe use as a folder/file name. */
export function safeSegment(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "_").trim();
}

/**
 * Write markdown into the vault. `relPath` is relative to VAULT_DIR
 * (e.g. "Algorithms II/Homework5.md"). Returns the absolute path written.
 */
export async function saveMarkdown(relPath: string, content: string): Promise<string> {
  const dest = join(resolve(config.vaultDir), relPath);
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, content, "utf8");
  return dest;
}
