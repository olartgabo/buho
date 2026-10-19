#!/usr/bin/env node
/**
 * One-time helper: exchange Moodle username/password for a web-services token.
 *
 * Usage:
 *   npm run get-token                 (prompts for username & password)
 *   npm run get-token -- USER PASS    (non-interactive)
 *
 * Paste the printed token into MOODLE_TOKEN in your .env file.
 * The password is never stored anywhere.
 */
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { getToken } from "../src/moodle/client.js";

async function prompt(question: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  if (hidden) {
    // Mute echo while typing the password.
    const orig = (stdout as unknown as { write: (s: string) => boolean }).write.bind(stdout);
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (s.includes(question)) orig(s);
    };
  }
  const answer = await rl.question(question);
  rl.close();
  if (hidden) stdout.write("\n");
  return answer.trim();
}

async function main() {
  const [argUser, argPass] = process.argv.slice(2);
  const username = argUser ?? (await prompt("Moodle username: "));
  const password = argPass ?? (await prompt("Moodle password: ", true));

  if (!username || !password) {
    console.error("Username and password are required.");
    process.exit(1);
  }

  try {
    const token = await getToken(username, password);
    console.log("\n✅ Token obtained. Add this line to your .env:\n");
    console.log(`MOODLE_TOKEN=${token}\n`);
  } catch (err) {
    console.error("\n❌ Failed to get token:", err instanceof Error ? err.message : err);
    console.error(
      "Tip: if you use UPB SSO / Google login, web-services tokens may be disabled for your account."
    );
    process.exit(1);
  }
}

main();
