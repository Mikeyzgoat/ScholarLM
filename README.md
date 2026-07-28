# ScholarLM

ScholarLM is a fully local semantic learning workspace for PDFs. It extracts
page-aware text, searches with local Nomic embeddings, explains selections with
a Gemma model served by Ollama, reads explanations with Kokoro, visualizes a
knowledge graph, and stores full tldraw snapshots with local recovery.

## Requirements

- [Bun](https://bun.sh/) 1.3 or newer
- Ollama
- A modern browser

## Setup

1. Create the environment file:

   ```sh
   cp .env.example .env
   ```

2. Pull the local models:

   ```sh
   ollama pull nomic-embed-text
   ollama pull gemma4:e2b
   ```

3. Install dependencies:

   ```sh
   cd backend
   bun install
   cd ../frontend
   bun install
   ```

4. Start the backend from `backend/`:

   ```sh
   bun run dev
   ```

5. In another terminal, start the frontend from `frontend/`:

   ```sh
   bun run dev
   ```

Open `http://localhost:3000`. The API defaults to `http://localhost:3001`.

To launch Ollama and both Bun applications together:

```sh
./run-dev.sh
```

The supervisor reuses Ollama when it is already running and stops only the
processes it started when you press Ctrl+C.

## Verification

Run strict TypeScript checks:

```sh
cd backend && bun run typecheck
cd ../frontend && bun run typecheck
```

Build the frontend:

```sh
cd frontend
bun run build
```

With the backend running, verify:

```sh
curl http://localhost:3001/health
```

The expected response is `{"ok":true}`.

## Local data

- SQLite: `backend/data/scholarlm.sqlite`
- PDFs: `backend/data/uploads/`
- Recovery drafts: browser localStorage under `scholarlm-note-draft:*`

The database and uploaded PDFs are ignored by Git.

## Workspace modes

- `/canvas` is an independent local-first tldraw canvas that does not require a
  PDF.
- A document workspace opens in split mode with the PDF and its persisted
  tldraw canvas side by side.
- Select PDF text to explain or save a page-aware highlight.
- Select a tldraw text shape to explain its content live.
- Nomic embeddings, explanations, and graph generation run through local
  Ollama.
