import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Must be the first import of every entry point. buhoVirtual and buhoSistemas
// each load their own .env when imported, and dotenv never overrides a set
// variable, so loading buhoHelp's .env (then the shared buho/.env) first makes
// it win when both servers run inside this process.
const packageDir = fileURLToPath(new URL("..", import.meta.url));
loadEnv({ path: [join(packageDir, ".env"), join(packageDir, "..", ".env")] });
