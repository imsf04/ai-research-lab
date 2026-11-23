# AI Research Lab

M11 now uses an Ink terminal client with streamed report previews, approval at the prompt, and persistent research projects. See [CLI usage](docs/cli.md), [gateway configuration](docs/hkust-api.md), and [workflow](docs/milestone9.md).

## Run locally

Requires Node 24 and pnpm 11.22.0.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env
```

Fill `apps/api/.env` before starting:

- `OPENAI_API_KEY` for the chat model. Keep `OPENAI_BASE_URL`, `OPENAI_API_STYLE=chat-completions` and `OPENAI_AUTH_HEADER=api-key` when pointing at the HKUST GenAI service.
- an embedding service. The same gateway serves `text-embedding-3-small` at 1536 dimensions; the commented block in `.env.example` holds the four lines to switch to it. Voyage and Jina work as well through `EMBEDDING_API_KEY`.

Persistence runs on PostgreSQL through `DATABASE_URL`. Start it with `docker compose up -d --wait`, which serves PostgreSQL 17 with pgvector on `127.0.0.1:5432`. Without Docker, set `DATABASE_DRIVER=pglite` and `PGLITE_DATA_DIR=.pglite`; PGlite runs the same engine inside the API process and keeps one connection, so a single process owns the directory.

Build the index once before the first run:

```bash
pnpm --filter @research-lab/api rag:ingest
```

Then start the API and the terminal client in separate terminals:

```bash
pnpm dev
pnpm cli
```

Enter a question to create a project; after completion, enter another message to revise it. Use `/upload path/to/notes.md` to index a document. Changing the embedding provider, model or dimensions invalidates the index, so run `pnpm --filter @research-lab/api rag:reindex` and restart; with PGlite stop the API first, because the data directory is held by a single process.

The API defaults to <http://localhost:3001>. The agent workbench UI can be started separately with `pnpm dev:web`.

## Verify

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

`apps/api` owns research and persistence; `apps/cli` is the terminal interface; `apps/web` is the agent workbench UI: project sidebar, tool-call timeline, human approvals, report rendering with clickable citations, and a sources/activity rail.

## Try a model

Copy `apps/api/.env.example` to `apps/api/.env`, then edit the model settings. Use an installed Ollama model name, or select OpenAI and set its model name and API key. No model name is hard-coded. Without `LLM_PROVIDER`, health checks still work and model requests return HTTP 503.

Restart `pnpm dev` after editing `.env`. In another terminal, run:

```bash
curl -sS -X POST http://localhost:3001/api/model/generate \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Explain tool calling in one sentence."}'

curl -N -X POST http://localhost:3001/api/model/stream \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Explain tool calling in one sentence."}'
```

The first returns JSON with `provider`, `model` and `text`. The second sends SSE `delta` events followed by `done`, or an `error` event if streaming fails. The server validates prompts, enforces `MODEL_TIMEOUT_MS`, and does not log prompts or API keys. `ModelProvider` also exposes Zod-validated structured output for later workflows; support depends on the configured model. Switch providers by changing `.env` and restarting the API.
