import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { config } from "../config.js";

/**
 * Tiny JSON-file cache for incremental sync. Keyed by a stable string
 * (we use the file's Moodle URL), storing the file's timemodified and where
 * we saved it. Lets sync_course/sync_all skip files that haven't changed.
 */

interface CacheEntry {
  timemodified: number;
  path: string;
}

type CacheData = Record<string, CacheEntry>;

function cacheFile(): string {
  return join(resolve(config.cacheDir), "sync.json");
}

export async function loadCache(): Promise<CacheData> {
  try {
    return JSON.parse(await readFile(cacheFile(), "utf8")) as CacheData;
  } catch {
    return {};
  }
}

export async function saveCache(data: CacheData): Promise<void> {
  await mkdir(resolve(config.cacheDir), { recursive: true });
  await writeFile(cacheFile(), JSON.stringify(data, null, 2));
}

export function isUnchanged(cache: CacheData, key: string, timemodified: number): boolean {
  return cache[key]?.timemodified === timemodified;
}

export function mark(cache: CacheData, key: string, timemodified: number, path: string): void {
  cache[key] = { timemodified, path };
}
