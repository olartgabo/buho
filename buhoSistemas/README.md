# buhoSistemas

An [MCP](https://modelcontextprotocol.io) server for **UPBnet** (`sistemas.upb.edu`), the UPB
academic portal. It logs in as you and gives an AI assistant the library's past-exam search, so it
can pull old exams for a subject, convert them to markdown, and quiz you on them.

> ⚠️ **Personal tool.** It acts on *your* account with *your* credentials. Respect the
> university's terms of service and only access material you're entitled to.

## Tools

| Tool | Description |
|------|-------------|
| `upbnet_whoami` | Log in and return the student's display name |
| `find_exam_subjects` | Search subject names (case- and accent-insensitive) |
| `search_exams` | Past exams of a subject, filterable by semester, campus and teacher. Also returns the values available for each filter |
| `download_exam` | Save one exam PDF to `DOWNLOAD_DIR/exams/<subject>/` |
| `exam_to_markdown` | Convert one exam to markdown in `VAULT_DIR/<subject>/exams/` |
| `sync_exams` | Convert every (filtered) exam of a subject. Incremental |

Subject arguments accept loose input (`"administracion de bases de datos"`). If a query matches
several subjects, the tool returns the candidates instead of guessing. UPBnet lists some subjects
twice, with and without accents, so this matters.

**Resource:** `upbnet://exams/{subject}` (URL-encode the name).
**Prompts:** `exam_practice` (arg `subject`), `exam_patterns` (arg `subject`).

## Setup

This package lives in the [buho](../README.md) monorepo. From the repo root:

```bash
npm install
cp buhoSistemas/.env.example buhoSistemas/.env   # or set ID/PASSWORD once in buho/.env
npm run build
```

`ID` is your numeric código de acceso. The server logs in on first use, keeps the session cookie in
memory, and logs in again if the session expires. Credentials are never logged or returned by a
tool.

| Variable | Default | Purpose |
|----------|---------|---------|
| `ID` / `PASSWORD` | — | UPBnet credentials (required) |
| `UPBNET_BASE_URL` | `https://sistemas.upb.edu` | Site root |
| `DOWNLOAD_DIR` | `./downloads` | Where exam PDFs are saved |
| `VAULT_DIR` | `./vault` | Where converted exams are written |
| `CACHE_DIR` | `./.cache` | `sync_exams` metadata |

## Run

```bash
npm run dev -w @buho/sistemas        # stdio
npm run dev:http -w @buho/sistemas   # Streamable HTTP on :8787 (MCP_HTTP_TOKEN gates it)
npm test -w @buho/sistemas           # parser tests
```

In [mcpjam](https://www.mcpjam.com/) (`npx @mcpjam/inspector@latest`): **Add Server → STDIO**,
Command `node`, Arguments `dist/server.js`, Working directory `buhoSistemas/`. Start with
`upbnet_whoami`, then `find_exam_subjects`.

## Notes

- Conversion uses the PDF text layer. Scanned exams have none: `exam_to_markdown` reports
  `hasText: false` and `sync_exams` lists them under `noText`. Open the PDF from `download_exam`
  for those.
- UPBnet is a server-rendered site with no public API, so this parses its HTML. If the
  university changes the page markup, the parsers in `src/upbnet/library.ts` and their tests are
  the place to update.
