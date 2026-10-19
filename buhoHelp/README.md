# buhoHelp

One [MCP](https://modelcontextprotocol.io) server with both UPB platforms, for studying:

- every [buhoVirtual](../buhoVirtual) tool (UPB Virtual / Moodle: courses, assignments, deadlines, material)
- every [buhoSistemas](../buhoSistemas) tool (UPBnet: past exams)
- prompts that use both

Both packages are mounted in-process on one server, so tool names are unchanged and an agent can
chain them, for example `sync_course` for the material and then `sync_exams` for the same subject's
past exams.

## Prompts

| Prompt | What it does |
|--------|--------------|
| `study_for_exam` (arg `course`) | Syncs the Moodle course and its UPBnet exams, then writes a study guide that maps each topic past exams ask about to the course material covering it |
| `exam_week_plan` | Day-by-day plan up to your upcoming deadlines, weighted by what past exams cover |

The prompts from buhoVirtual and buhoSistemas are included too. Moodle course names and UPBnet
subject names often differ, so the prompts tell the agent to confirm the match with
`find_exam_subjects` and ask you when it's unclear.

## Setup

From the [buho](../README.md) repo root:

```bash
npm install
cp .env.example .env     # ID and PASSWORD: your UPB credentials, used for both sites
npm run build
```

`buhoHelp/.env`, if present, overrides the shared `buho/.env`. See `.env.example` for the optional
`MOODLE_TOKEN`, directory settings and `MCP_HTTP_TOKEN`.

## Run

```bash
npm run dev:help                 # stdio, from the repo root
npm run dev:http -w @buho/help   # Streamable HTTP on :8787
```

MCP client config after `npm run build`:

```json
{
  "mcpServers": {
    "buho": {
      "command": "node",
      "args": ["/path/to/buho/buhoHelp/dist/server.js"]
    }
  }
}
```
