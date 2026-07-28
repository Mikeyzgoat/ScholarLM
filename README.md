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

2. Set `GEMINI_API_TOKEN` in `.env`. The backend also accepts `GEMINI_API_KEY` for compatibility.

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
