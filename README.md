# buho

[MCP](https://modelcontextprotocol.io) servers that let an AI assistant study with a UPB student:

| Package | Platform | What it gives the agent |
|---------|----------|-------------------------|
| [`buhoVirtual`](./buhoVirtual) | [UPB Virtual](https://www.upbvirtual.net/upbvirtual/) (Moodle) | Courses, assignments, deadlines, grades, announcements, course material synced to markdown |
| [`buhoSistemas`](./buhoSistemas) | [UPBnet](https://sistemas.upb.edu/) | Past exams from the library: search, download, convert to markdown |
| [`buhoHelp`](./buhoHelp) | both | Every tool from both servers on one server, plus prompts that combine them |

Each server runs on its own. Use `buhoHelp` if you want one connection with everything.

> ⚠️ **Personal tools.** They act on *your* accounts with *your* credentials. Respect the
> university's terms of service and only access material you're entitled to.

## Quick start

Requires Node 18+.

```bash
git clone https://github.com/olartgabo/buho.git
cd buho
npm install
cp buhoHelp/.env.example .env   # set ID and PASSWORD (your UPB credentials)
npm run build
npm run inspect                 # mcpjam inspector → Add Server → STDIO → node buhoHelp/dist/server.js
```

One `.env` at the repo root covers all three servers. A package's own `.env` overrides it.
`.env` files are gitignored.

## Layout

```
buhoVirtual/    @buho/virtual   — Moodle REST client, vault sync, shared HTTP transport
buhoSistemas/   @buho/sistemas  — UPBnet session client + library HTML parsers
buhoHelp/       @buho/help      — mounts both on one McpServer, cross-site prompts
```

npm workspaces link the packages; build order is virtual → sistemas → help (`npm run build`).

## Scripts (repo root)

| Script | What it does |
|--------|--------------|
| `npm run build` | Build all three packages |
| `npm test` | Run package tests |
| `npm run dev:virtual` / `dev:sistemas` / `dev:help` | Run one server over stdio with tsx |
| `npm run inspect` | Launch the mcpjam inspector |

## License

[MIT](./LICENSE)
