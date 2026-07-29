# ScholarLM

ScholarLM is an AI learning workspace for PDFs. It extracts page-aware text,
searches with hosted embeddings, routes explanations and visual reasoning
through OpenRouter, reads explanations locally with compact Kokoro TTS,
visualizes a knowledge graph, and stores full tldraw snapshots with local
recovery.

## Requirements

- [Bun](https://bun.sh/) 1.3 or newer
- An OpenRouter API key
- A modern browser

## Setup

1. Create the environment file:

   ```sh
   cp .env.example .env
   ```

2. Add your OpenRouter key to `.env`:

   ```sh
   OPENROUTER_API_KEY=your_key_here
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

Run the backend and frontend in separate terminals using the commands above.

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
- PDF text-layer geometry is captured as a page-aware region. Add a detected
  region to the linked notes canvas first, then optionally request a streamed
  explanation.
- Select a tldraw text shape to explain its content live.
- OpenRouter Auto selects the generation model per task and routes requests to
  high-throughput providers. Its default allowlist favors Qwen 3.5 Flash,
  Gemma 4 26B, Seed 1.6 Flash, and Mistral Small 3.2, with hard price ceilings
  of $0.20/M input tokens and $0.40/M output tokens.
- Embeddings use OpenRouter's hosted embeddings API and are stored locally.
- Kokoro TTS remains local and uses the compact INT8 model.
