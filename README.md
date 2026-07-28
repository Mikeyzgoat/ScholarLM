# ScholarLM

ScholarLM is a local-first semantic learning workspace for PDFs. It extracts page-aware text, searches it with Gemini embeddings, explains selected passages, reads explanations with Kokoro, visualizes a knowledge graph, and stores full tldraw note snapshots with local recovery.

## Requirements

- [Bun](https://bun.sh/) 1.3 or newer
- A Gemini API token
- A modern browser

## Setup

1. Create the environment file:

   ```sh
   cp .env.example .env
   ```

2. Set `GEMINI_API_TOKEN` in `.env`. The backend also accepts
   `GEMINI_API_KEY` for compatibility. For multiple independent keys, set
   `GEMINI_API_TOKENS` to a comma-separated list.

3. Install the local AI fallback used when Gemini is unavailable or
   rate-limited:

   ```sh
   ollama pull nomic-embed-text
   ollama pull gemma4:e2b
   ```

   Ollama serves locally at `http://localhost:11434` by default. Override
   `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, or `OLLAMA_EMBEDDING_MODEL` in `.env`
   when needed.

   For concurrent generation on a separate GPU host, run an SGLang
   OpenAI-compatible server and set `SGLANG_BASE_URL` plus `SGLANG_MODEL`.
   ScholarLM then tries Gemini, SGLang, and finally local Ollama. SGLang uses
   Hugging Face/PyTorch weights and does not consume Ollama GGUF blobs.

4. Install dependencies:

   ```sh
   cd backend
   bun install
   cd ../frontend
   bun install
   ```

5. Start the backend from `backend/`:

   ```sh
   bun run dev
   ```

6. In another terminal, start the frontend from `frontend/`:

   ```sh
   bun run dev
   ```

Open `http://localhost:3000`. The API defaults to `http://localhost:3001`.

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
- Gemini is attempted first. Independent Gemini keys rotate on failure, then
  the backend falls back to local Ollama generation and embeddings.
