# ScholarLM — Future Upgrades and Engineering Roadmap

Last reviewed: 29 July 2026

> Runtime update: generation now uses OpenRouter Auto, embeddings use
> OpenRouter's hosted embeddings API, and only compact Kokoro TTS remains local.
> Historical Ollama references below describe the previous baseline and should
> not be treated as current setup instructions.

## Purpose of this document

ScholarLM's original build checklist described an early Gemini-based MVP. The
application has since become a substantially broader, local-first learning
workspace. That checklist is therefore no longer an accurate description of
either the current product or the work that remains.

This document records:

- what already exists and should be treated as the current baseline;
- known reliability and usability work that still deserves verification;
- upgrades that can be delivered without changing the product's architecture;
- larger V2 and V3 ideas that require deliberate design work;
- acceptance criteria for each future phase;
- work that should remain deferred until measurements justify the complexity.

This is a roadmap, not a claim that every proposed feature must be built. Each
phase should be reassessed against real usage before implementation.

---

## 0. Tomorrow's testing and fixing checklist

This is the immediate handoff checklist for the next development session. Do
not begin a model migration or unrelated UI feature until these three paths have
been tested with clean data.

### 0.1 Test document embeddings end to end

Use a small, known multi-page PDF and verify the complete pipeline rather than
judging it only from the ingestion status label.

Checklist:

- upload returns promptly and the PDF opens immediately;
- the document reaches `extracting`, `chunking`, `embedding`, `graphing`, and
  finally `ready`;
- `document_pages` contains the expected number of page-aware rows;
- `chunks` contains non-empty, sensibly bounded text;
- every completed chunk has a valid embedding with one consistent dimension;
- duplicate upload reuses existing ingestion work without preventing rendering;
- a semantic query returns the expected page among the top results;
- a paraphrased query works without copying exact PDF wording;
- an absent-answer query does not return an invented document answer;
- reopening the same document does not regenerate all embeddings;
- backend errors clearly distinguish missing Ollama, missing model, extraction
  failure, and embedding failure.

Record:

- PDF page count and chunk count;
- embedding model and vector dimension;
- total embedding time;
- first-query latency and warmed-query latency;
- top returned pages for at least five known questions.

### 0.2 Test knowledge graph generation

Test both the dedicated Knowledge Atlas and the graph shown in document-related
views.

Checklist:

- a source bead appears immediately after upload;
- concept nodes appear after graph extraction;
- edges reference real nodes and have readable relationships;
- clicking a source node opens exactly one action menu;
- the menu can open the source, create a new linked note, or list existing
  linked notes;
- linked notes render as subnodes of the correct source;
- newly created and deleted notes update the graph immediately;
- fuzzy search locates sources, concepts, and linked notes;
- selecting a concept with provenance opens the correct PDF page;
- graph physics settles instead of consuming CPU forever;
- zoom, reset, relayout, light theme, and dark theme all remain functional;
- a failed concept extraction retains the source bead and offers a retry.

Record:

- graph-generation duration;
- number of concepts and edges;
- malformed or duplicate nodes;
- unsupported relationships invented by the model;
- interaction or layout failures at different viewport sizes.

### 0.3 Test canvas equation graphing

The current graph-generation behavior is not accepted as complete. It relies too
heavily on the LLM interpreting a selected image and can produce an unrelated
equation or an unhelpful graph.

Test:

- a typed `y = sin(x)`;
- a neatly handwritten `y = sin(x)`;
- a handwritten `y = x²`;
- a handwritten circle such as `x² + y² = 1`;
- assigned variables followed by an expression;
- an equation that is solvable but not graphable;
- ambiguous handwriting;
- two equations intended for the same graph.

For each case, record:

- recognized equation;
- whether the recognition is exact;
- whether the correct graph action appears;
- plotted domain and range;
- plot correctness;
- response latency;
- whether editing the source equation updates the graph.

#### Tomorrow's exit condition

The session is complete when the three paths have written pass/fail results,
reproducible failures have issues or test cases, and the highest-impact failure
has a scoped fix. A green ingestion badge alone is not sufficient evidence.

---

## 1. Current product baseline

The following capabilities are already represented in the current codebase and
must not be rebuilt from scratch.

### 1.1 Local-first AI

- Ollama is the inference runtime.
- `nomic-embed-text` generates document and query embeddings locally.
- `gemma4:e2b` is the current explanation and graph-generation model.
- Ollama responses are consumed as streams by the backend.
- Model requests disable thinking where the runtime and model support it.
- Explanations are constrained to plain English and mathematical symbols rather
  than raw Markdown.
- The explanation route accepts typed text and selected canvas images.
- A requested or useful mathematical graph can be returned as structured plot
  data and inserted into the canvas.
- Gemini and SGLang are not part of the active runtime.

### 1.2 Documents and semantic retrieval

- PDFs can be uploaded, stored locally, listed, opened, and deleted.
- Duplicate PDF detection avoids repeating ingestion work.
- PDF delivery is independent from background embedding generation.
- Page-aware text extraction, chunking, and local embeddings are persisted.
- Semantic search uses the document's stored embeddings.
- Ask-PDF retrieval is scoped to the currently open document.
- Retrieval returns page-aware evidence rather than arbitrary extracted text.
- Document ingestion exposes user-visible progress and failure states.

### 1.3 PDF workspace

- PDF rendering uses compatible `react-pdf` and `pdfjs-dist` versions.
- PDF navigation and zoom are available.
- Text selections require an explicit explain action.
- Page-aware highlights and explanations can be used beside the canvas.
- The PDF and notes canvas are separate surfaces that can be used together.
- The workspace can open independently of embedding completion.

### 1.4 Notes and canvas

- Independent empty canvases can be created.
- Notes have generated human-readable names and can be renamed.
- Full tldraw snapshots are persisted in SQLite.
- Local browser recovery drafts protect unsaved edits.
- Server autosave is revision-aware.
- Multiple tldraw pages are persisted as part of the snapshot.
- The active tldraw page and custom page pagination are synchronized.
- Notes can be listed, opened, renamed, duplicated, and deleted.
- Deletion requires confirmation and invalidates stale note/document lists.
- Generated questions and answers are grouped on the canvas.
- Generated answers are positioned near the selected source region.
- Generated outputs are indexed so clicking an answer offers regeneration
  instead of recursively explaining the answer.
- Previous explanation revisions are retained in SQLite.

### 1.5 Speech

- Kokoro provides local text-to-speech.
- Long explanations are divided into manageable speech segments.
- Generated speech segments can be combined for continuous playback.
- Pause, resume, replay, stop, and auto-read controls are available.
- Word highlighting is synchronized with playback where timing data permits it.
- Speech output is indexed alongside the corresponding explanation.
- Browser speech synthesis is available as a fallback when Kokoro fails.

### 1.6 Knowledge graph

- A global knowledge atlas and document-specific graph routes exist.
- Every document can be represented by a source node even when concept
  extraction fails.
- Document nodes can expose actions for opening the source, creating notes, and
  opening existing linked notes.
- Notes are shown as connected subnodes.
- Graph nodes use a force-directed layout with interactive physics.
- Fuzzy search can locate graph concepts and sources.
- Graph controls support zooming, camera reset, and layout reruns.

### 1.7 Interface and theme

- Notes are the home page.
- Documents, upload, notes, and knowledge graph are available from navigation.
- The sidebar is collapsible and closes when focus moves to the page content.
- Dark mode is the default with the orange ScholarLM visual identity.
- Light mode uses a white and blue-green visual identity.
- Theme selection applies across the application and canvas-related UI.
- Canvas text color adapts to the selected theme.
- Google Sans assets are included and used by the application.
- Main interactions use the project's glass-like surfaces and restrained motion.

---

## 2. Immediate reliability phase — P0

These tasks should be completed before adding another major feature. The goal is
to make a clean, repeatable user journey boringly reliable.

### 2.1 Build a repeatable end-to-end smoke test

Create one deterministic test fixture PDF containing:

- selectable body text;
- at least one heading and repeated concept;
- a simple mathematical equation;
- multiple pages;
- enough text to create multiple chunks.

Automate or document the following clean-run sequence:

1. Start Ollama, the backend, and the frontend.
2. Confirm the backend health endpoint.
3. Create an independent note.
4. Add shapes and a second tldraw page.
5. Reload and verify both pages and the active page survive.
6. Rename the note and verify the library updates immediately.
7. Delete the note and verify it disappears from Notes and Recents.
8. Upload the fixture PDF.
9. Verify that the PDF renders before ingestion completes.
10. Verify extraction, chunking, embeddings, and graph generation complete.
11. Upload the same file again and verify duplicate handling.
12. Search for a concept and open the returned page.
13. Select PDF text, explicitly request an explanation, and retry it.
14. Select a canvas region and request an explanation.
15. Generate a graph when requested.
16. Reload and verify highlights, generated output, audio metadata, and layout.
17. Delete the source and verify associated local files and UI entries disappear.

#### Acceptance criteria

- The sequence passes twice from a clean state without manual database edits.
- A frontend failure never corrupts the persisted note snapshot.
- An ingestion failure does not prevent the original PDF from opening.
- Deleted items disappear from every query-backed list immediately.
- The browser console and backend terminal show no uncaught exceptions.

### 2.2 Add automated backend integration tests

Cover at minimum:

- health and not-found response shapes;
- invalid, oversized, and non-PDF uploads;
- duplicate upload detection;
- PDF file streaming during ingestion;
- document deletion and file cleanup;
- note create, update, revision conflict, rename, and delete;
- explanation validation and timeout reporting;
- cached explanation lookup and revision history;
- speech cache lookup and missing-audio behavior;
- document-scoped semantic retrieval;
- graceful behavior when Ollama is unavailable.

Use temporary test databases and upload directories. Tests must never mutate
`backend/data/scholarlm.sqlite` or real uploaded files.

#### Acceptance criteria

- Tests are runnable with one documented Bun command.
- Tests clean up temporary state even after a failure.
- No test requires internet access.
- Ollama-dependent tests can use a controlled local stub at the HTTP boundary;
  generated content itself should not be mocked in end-to-end model tests.

### 2.3 Add focused frontend tests

Prioritize stateful failure-prone flows over snapshot-heavy component tests:

- sidebar outside-click behavior;
- note deletion confirmation and query invalidation;
- local/server snapshot selection;
- autosave debounce and revision conflict recovery;
- tldraw active-page synchronization;
- generated-output click classification;
- explicit explain action versus ordinary selection;
- explanation retry versus new explanation;
- PDF visibility while status is `embedding` or `graphing`;
- theme persistence and canvas text contrast.

#### Acceptance criteria

- Tests reproduce the classes of regressions previously found manually.
- Selection alone never sends an explanation request.
- Clicking generated output never creates a nested explanation request.
- Page indicators always derive from the same authoritative page state.

### 2.4 Remove one-time development migrations

Review browser bootstrap reset keys and schema compatibility code. One-time
cleanup logic should not execute indefinitely on every startup.

Expected work:

- version browser migrations explicitly;
- record completed migration versions;
- remove obsolete reset behavior after the supported migration window;
- ensure a normal application update does not erase user notes;
- document how a developer can intentionally reset local test data.

#### Acceptance criteria

- Restarting Bun or refreshing the browser never asks users to reset tldraw.
- Existing valid notes survive frontend deployments.
- An incompatible snapshot produces a recoverable warning and export option.

---

## 3. Grounded vision and model evaluation — P1

Do not replace the active model based on a single screenshot. Establish a small
benchmark first.

### 3.1 Evaluate MiniCPM-V as a vision front end

Candidate: `minicpm-v4.6`

MiniCPM-V is promising as a lightweight image reader. Initial manual testing
showed that it could correctly read:

```text
x = 4
y = 9
x² + y² = 1
```

It also demonstrated an important weakness: when asked about an anime image, it
invented a possible character or series identity without evidence. This means
it should not be trusted as an unrestricted factual authority.

Evaluate it with a fixed dataset containing:

- clear printed equations;
- neat handwritten equations;
- messy handwritten equations;
- diagrams with labels;
- graphs with axes;
- textbook screenshots;
- ordinary images with no text;
- ambiguous or deliberately unreadable selections.

Measure:

- exact transcription accuracy;
- symbol insertion and omission rate;
- unsupported identity or context claims;
- time to first token;
- total response time;
- memory use;
- behavior on CPU-only and RTX 4050 hardware;
- structured-output compliance.

### 3.2 Use a general grounded prompt

The vision prompt should set an evidence boundary without forcing every request
into a mathematical format:

```text
Answer directly and concisely using only information visible in the image and
context explicitly supplied by the user.

- Do not invent names, identities, symbols, values, relationships, or context.
- Do not guess the source or meaning unless it is clearly supported.
- Preserve visible text, equations, and symbols exactly.
- If something is unclear, identify the uncertainty instead of completing it.
- Separate direct observations from interpretations.
- Perform only the reasoning needed to answer the request.
- Verify calculations and factual claims.
- Do not reveal internal reasoning.
- If evidence is insufficient, say so rather than filling the gap.
```

Recommended generation settings for evaluation:

```json
{
  "think": false,
  "stream": true,
  "options": {
    "temperature": 0.1,
    "top_p": 0.8,
    "repeat_penalty": 1.1,
    "num_predict": 500
  }
}
```

Runtime support must be verified rather than assumed. Passing
`--think=false` inside an interactive prompt is not equivalent to sending the
Ollama API's `think: false` field.

### 3.3 Compare model strategies

Test at least three practical configurations:

#### Configuration A — current single model

- Gemma handles selected text, selected images, explanations, and graph plans.
- Lowest operational complexity.
- Existing image interpretation quality remains the baseline.

#### Configuration B — alternative single vision model

- A capable vision-language model handles transcription and explanation.
- Candidate models should be tested on the actual RTX 4050 memory budget.
- One model is easier to keep loaded, but lightweight models may sacrifice
  reasoning quality.

#### Configuration C — two-stage grounded pipeline

1. MiniCPM-V transcribes only what is visible.
2. A text model or deterministic mathematics layer solves and explains it.

This isolates visual recognition from reasoning and makes intermediate output
auditable. It also introduces another loaded model and an additional failure
boundary, so it should be adopted only if benchmark accuracy improves enough.

#### Acceptance criteria

- No model switch until the benchmark results are recorded.
- The selected configuration improves exact equation transcription and does not
  materially worsen response time.
- Ambiguous input yields uncertainty rather than fabricated symbols.
- The application remains usable when only CPU inference is available, even if
  the UI must communicate a longer expected wait.

---

## 4. Explanation quality and mathematical tooling — P1

### 4.0 Build a Math Notes-style ink-to-graph experience

This should replicate the interaction principle of Apple Math Notes and Samsung
Notes without copying their visual design.

Apple's documented behavior is:

- the user writes or types a mathematical expression;
- ending an expression with `=` can solve it inline;
- writing an equation with `x` and `y` exposes an Insert Graph action;
- graphs can be added to an existing graph;
- editing the equation updates the graph;
- ambiguous or unrecognized handwriting is surfaced for correction.

Samsung similarly enables a Math Solver mode in which handwritten or typed
expressions ending with `=` are solved inline. Both experiences are built
around recognizing the mathematical object first, not asking a general-purpose
model to narrate a screenshot.

ScholarLM's target pipeline should be:

```text
Pen strokes become stable
    ↓
Detect a likely mathematical region
    ↓
Recognize and normalize the equation
    ↓
Show the recognized equation for confirmation when confidence is low
    ↓
Classify: solve, graph, both, or unsupported
    ↓
Use a deterministic math engine
    ↓
Render an inline result or a graph linked to the source strokes
```

#### Interaction design

- Math recognition should be an optional canvas mode to avoid interpreting
  ordinary sketches as equations.
- Recognition should run after a short idle debounce, not on every pen point.
- A trailing `=` can request inline calculation.
- A graphable relation should expose a small glass-like `Insert graph` chip near
  the equation.
- High-confidence recognition may show the chip immediately.
- Low-confidence recognition must show the interpreted equation and allow the
  user to correct it.
- Users can dismiss the action without modifying their handwriting.
- Selecting an existing equation should expose `Solve`, `Insert graph`,
  `Replace graph`, and `Add to graph` where applicable.
- The generated result and graph remain grouped with and linked to the source
  strokes.
- Moving the handwriting moves the group or preserves an intentional connector.
- Editing or rewriting the source invalidates the old result and offers an
  update; it must not silently leave an incorrect graph.

#### Engineering design

Separate the job into bounded stages:

1. **Stroke grouping:** use timing, distance, and bounding-box overlap to group
   nearby ink strokes into a candidate expression.
2. **Recognition:** send only the cropped candidate region to a vision
   recognizer. Ask for exact transcription and uncertainty, not a solution.
3. **Normalization:** convert superscripts, multiplication symbols, brackets,
   and common handwritten variants into a safe internal expression format.
4. **Parsing:** build an abstract syntax tree using a restricted math grammar.
5. **Classification:** determine whether the expression is arithmetic, an
   assignment, an equation, a 2D relation, or unsupported.
6. **Evaluation:** use a deterministic mathematics library or isolated safe
   evaluator for supported operations.
7. **Plotting:** sample the verified expression, reject non-finite values, split
   discontinuities, choose a useful viewport, and pass validated points to the
   existing canvas plot renderer.
8. **Linking:** store source shape IDs, normalized expression, graph shape IDs,
   recognition confidence, and revision in the note metadata/database.

The language model may explain the verified result afterward. It must not be
responsible for inventing plot points or deciding what symbols were present
without an inspectable transcription step.

#### Initial supported scope

- arithmetic and parentheses;
- variable assignments;
- powers and roots;
- common trigonometric functions;
- explicit functions such as `y = f(x)`;
- simple implicit two-variable relations such as circles;
- multiple 2D equations on one graph;
- configurable or automatically selected finite domains.

Defer initially:

- symbolic integration with arbitrary assumptions;
- differential equations;
- arbitrary 3D surfaces;
- matrices and advanced linear algebra;
- executing user-provided code;
- fully automatic recognition of every canvas sketch.

#### Acceptance criteria

- Writing a supported equation produces a graph action without opening the
  explanation panel.
- The graph action does not require the user to lasso and ask the LLM.
- The recognized equation is inspectable before plotting.
- Ambiguous handwriting is never silently converted into a confident graph.
- `y = sin(x)` and `y = x²` generate correct plots.
- `x² + y² = 1` generates a circle or clearly reports that the first release
  does not yet support implicit plotting.
- Two compatible equations can be overlaid with distinct colors and a legend.
- Editing the source equation updates or explicitly invalidates its graph.
- Undo and redo treat the generated result as normal canvas mutations.
- Recognition, evaluation, and plotting failures have separate error messages.
- The entire feature works locally.

### 4.1 Add a deterministic verification layer

Language models should not be the only authority for arithmetic or graphable
expressions.

Potential implementation:

- parse a safe, limited mathematical expression grammar;
- normalize common Unicode operators and superscripts;
- verify arithmetic substitutions;
- detect contradictions in simple equation systems;
- derive plot domains conservatively;
- reject unsupported syntax rather than evaluating arbitrary code.

The deterministic result can be supplied to the explanation model as verified
context. It should not silently overwrite the user's transcription.

#### Acceptance criteria

- `x=4`, `y=9`, and `x²+y²=1` is identified as inconsistent.
- Unsupported or ambiguous notation cannot execute code.
- Verification errors are shown as uncertainty, not converted into false facts.
- Plot points are finite, bounded, and validated before canvas insertion.

### 4.2 Improve multi-region selection

When users draw around multiple independent regions:

- preserve each region's coordinates and reading order;
- capture each region separately;
- send one batched request with explicit region identifiers;
- require a structured answer keyed to those identifiers;
- create one answer block per region;
- position each answer relative to its corresponding question;
- retain one shared request ID for traceability and retry.

#### Acceptance criteria

- Two selected questions produce two separately placeable answers.
- Answers cannot be silently swapped between regions.
- A partial model response is visibly marked rather than attached to the wrong
  source.
- Retrying one answer does not regenerate unrelated answers.

### 4.3 Strengthen explanation lineage

Persist a complete relationship between:

- note and tldraw page;
- source document and PDF page when applicable;
- selected shape IDs or PDF coordinates;
- normalized selected content hash;
- model and prompt version;
- explanation revision;
- graph payload;
- speech record.

This is an audit and recovery feature, not a user-facing chat history.

#### Acceptance criteria

- Every generated canvas output can identify its source region.
- Every regeneration preserves the previous revision.
- Moving a question does not break its logical link to the answer.
- Deleted source shapes produce an intentional orphan state rather than broken
  foreign references.

---

## 5. Retrieval quality and scalability — P1/P2

### 5.1 Measure current semantic RAG quality

Build a small evaluation set for each fixture document:

- direct fact questions;
- paraphrased questions;
- questions requiring two nearby chunks;
- questions whose answer is absent;
- questions containing terminology shared across several pages.

Track:

- retrieval recall at 3, 5, and 8 chunks;
- page accuracy;
- answer faithfulness to retrieved evidence;
- unsupported-claim rate;
- end-to-end latency;
- embedding and index warm-up time.

### 5.2 Add citations to Ask PDF

Every document answer should retain and display:

- source page number;
- a short supporting excerpt;
- retrieval score or a user-friendly relevance label;
- an action that navigates to the cited page.

If retrieved evidence is insufficient, the model should decline to answer.

#### Acceptance criteria

- Every factual answer has at least one inspectable source.
- Citation clicks navigate to the correct page.
- No-answer questions do not produce confident unsupported answers.

### 5.3 Improve chunking based on evidence

Only tune chunking after retrieval measurements. Candidate improvements:

- heading-aware chunk boundaries;
- paragraph continuity metadata;
- equation and caption preservation;
- neighboring-chunk expansion after initial retrieval;
- deduplication of overlapping results;
- document-specific query normalization.

Avoid introducing a new chunker simply because it is more sophisticated.

### 5.4 Keep the current vector strategy until scale requires more

The current local index is appropriate for a personal workspace and modest
document library. A dedicated approximate nearest-neighbor index should be
considered only after measured startup, memory, or query latency becomes
unacceptable.

Possible later options:

- SQLite vector extension;
- HNSW index persisted beside SQLite;
- memory-mapped vector storage;
- incremental index updates;
- metadata filters before vector search.

#### Explicitly deferred

A one-million-vector architecture is not currently required. Adding it now
would increase installation, persistence, migration, and debugging complexity
without improving the present user journey.

---

## 6. Speech quality and accessibility — P2

### 6.1 Validate persistent speech indexing

Confirm that the speech database stores and retrieves the intended relationship
between explanation text, revision, voice settings, and generated audio.

Do not rely on a claimed `O(1)` lookup without measuring it. A properly indexed
SQLite lookup is effectively fast for this scale, but file/blob decoding and
audio playback still contribute latency.

#### Acceptance criteria

- Replaying unchanged generated text does not rerun Kokoro.
- Regenerated text creates a distinct speech record.
- Deleted notes clean up unreachable speech records.
- Database growth and cleanup behavior are documented.

### 6.2 Improve streaming playback

Investigate genuine incremental playback rather than waiting for every segment:

- synthesize bounded text segments;
- preserve sentence order;
- begin playback after a safe initial buffer;
- continue generating subsequent segments;
- cancel outstanding generation when the user stops or changes explanation;
- fall back cleanly when a segment fails.

Combined playback must sound continuous and must not replay a segment.

### 6.3 Accessibility

- Add full keyboard controls for playback.
- Expose playback state through accessible labels.
- Respect reduced-motion settings during word highlighting.
- Ensure highlighted words meet contrast requirements in both themes.
- Keep the full text readable when timing metadata is unavailable.

---

## 7. Knowledge graph upgrades — P2

### 7.1 Make provenance inspectable

Each concept node should expose:

- source document;
- relevant page or pages;
- supporting excerpt;
- linked notes;
- relationship labels;
- confidence or extraction status.

### 7.2 Support incremental graph updates

Graph generation currently follows document ingestion. A future incremental
flow could:

- add the source bead immediately;
- add concepts in batches as extraction completes;
- connect newly created notes without rebuilding document concepts;
- rebuild only one document subgraph when requested;
- preserve stable node IDs across rebuilds.

### 7.3 Improve large-graph interaction

When real graph size justifies it:

- collapse low-relevance concept clusters;
- filter by document, note, or relationship type;
- search and focus without rerunning layout;
- pause physics after the graph settles;
- persist manual node positions;
- virtualize expensive side-panel results.

#### Acceptance criteria

- Graph interaction remains smooth on the target laptop.
- Physics does not consume CPU continuously after settling.
- A focused node and its menu remain stable while the surrounding layout moves.
- The document graph shown inside another page uses the same interactive
  component, not a decorative or non-responsive imitation.

---

## 8. Performance and resource awareness — P2

### 8.1 Add lightweight diagnostics

Expose a developer diagnostics view or structured logs for:

- Ollama connectivity;
- loaded model and model configuration;
- ingestion phase timings;
- PDF extraction duration;
- embedding throughput;
- retrieval duration;
- time to first explanation token;
- total explanation duration;
- Kokoro initialization and synthesis duration;
- vector-index warm state.

Do not expose private document content in logs by default.

### 8.2 Make timeouts operation-specific

CPU-only inference can legitimately exceed a generic 60-second timeout.

Use separate policies for:

- Ollama connection establishment;
- first streamed token;
- inactivity between streamed chunks;
- total request lifetime;
- embeddings;
- graph extraction;
- speech synthesis.

Allow cancellation from the frontend and distinguish cancellation, inactivity,
model failure, and unavailable service in error messages.

### 8.3 Optimize frontend motion

Profile before changing animations. Potential causes of stutter include:

- continuously running graph physics;
- expensive backdrop blur over large regions;
- tldraw and PDF rendering at the same time;
- layout-triggering animations;
- rerenders caused by rapidly changing save or playback state.

Preferred improvements:

- animate transforms and opacity;
- stop ForceAtlas2 after stabilization;
- reduce full-screen blur layers;
- memoize expensive derived graph and canvas state;
- isolate high-frequency audio highlighting updates;
- respect `prefers-reduced-motion`.

#### Acceptance criteria

- Performance decisions include a profiler trace or repeatable measurement.
- No animation runs continuously when the relevant surface is hidden.
- Selecting, drawing, and scrolling remain responsive during background
  ingestion.

---

## 9. Data integrity, privacy, and security — P2

### 9.1 Database lifecycle

- Add explicit schema versions and migrations.
- Enable and periodically verify foreign-key integrity.
- Define cleanup rules for documents, chunks, graph nodes, notes, explanation
  revisions, and speech records.
- Add an export and import format for user-owned notes and sources.
- Add an optional local backup command.

### 9.2 Upload hardening

- Validate the PDF signature as well as the filename and MIME type.
- Keep normalized generated storage names.
- Reject path traversal and malformed multipart requests.
- Bound extraction resources for unusually complex PDFs.
- Preserve readable error messages without leaking filesystem paths.

### 9.3 Local privacy guarantees

- Keep `.env`, SQLite databases, generated audio, uploaded PDFs, and model
  scratch data ignored by Git.
- Document precisely which processes receive document content.
- If cloud inference is ever added, make it opt-in per request and visibly
  distinguish it from local execution.
- Never silently fall back from local inference to a cloud provider.

### 9.4 Dependency maintenance

- Keep `react-pdf` and `pdfjs-dist` API/worker versions aligned.
- Update dependencies in controlled batches.
- Run typechecks, production build, smoke tests, and vulnerability review after
  each batch.
- Avoid `latest` ranges in production-facing manifests once a stable release is
  tagged.

---

## 10. Product polish — P2

### 10.1 About the developer page

An About page is appropriate if it stays concise and product-connected.

Suggested contents:

- a short statement about why ScholarLM exists;
- the local-first learning philosophy;
- the developer's name, role, and selected links;
- technology credits and open-source acknowledgements;
- current version and roadmap link.

Avoid a long biography inside the primary workspace navigation. It can live
under Settings/About or the footer.

### 10.2 Settings surface

Potential settings:

- dark, light, or system theme;
- auto-read default;
- preferred Kokoro voice and speaking rate;
- selected Ollama model;
- model timeout profile;
- reduced motion;
- local data export, import, and reset;
- diagnostics visibility.

Settings must be validated against available runtime capabilities. A model name
typed into a field should not be treated as installed until Ollama confirms it.

### 10.3 Better first-run experience

- Detect that Ollama is unavailable and explain exactly what is missing.
- List required models and copyable pull commands.
- Allow the non-AI parts of the application to remain usable.
- Show sample actions without injecting fake documents or notes.
- Never recreate fuzzy demonstration data after the user clears it.

---

## 11. V2 exploration — agentic learning assistant

This section is intentionally not part of the current implementation.

An agentic ScholarLM should not merely add a longer system prompt. It requires a
controlled tool loop, explicit state, permissions, and observable execution.

### 11.1 Potential tools

- retrieve document evidence;
- inspect a specific PDF page;
- inspect selected canvas regions;
- transcribe an image;
- verify a mathematical expression;
- generate plot data;
- add or update a canvas group;
- create links between notes and concepts;
- synthesize or retrieve speech;
- ask the user for clarification.

### 11.2 Execution model

```text
User intent
    ↓
Planner selects bounded tools
    ↓
Tools return structured observations
    ↓
Verifier checks evidence and mathematical output
    ↓
Composer produces the explanation
    ↓
User approves any persistent canvas mutation
```

### 11.3 Required safeguards

- Tool calls must use strict schemas.
- Read and write tools must be distinguished.
- Canvas mutations must be idempotent.
- Every answer must retain evidence and tool provenance.
- Iteration and token budgets must be bounded.
- The agent must stop and ask when source information is ambiguous.
- Failed tool calls must not be converted into invented observations.
- The user must be able to inspect and undo persistent changes.

### 11.4 V2 acceptance gate

Do not begin agentic implementation until:

- the non-agentic explanation pipeline is reliable;
- retrieval faithfulness has a measured baseline;
- deterministic math verification exists;
- canvas mutations have stable undo and revision behavior;
- the target local model demonstrates reliable structured tool calling.

---

## 12. V3 possibilities

These are long-term ideas, not commitments:

- multimodal lecture ingestion;
- locally indexed audio and video transcripts;
- cross-document synthesis with explicit citations;
- spaced-learning suggestions derived from the user's notes;
- optional collaboration with a separately designed identity and sync model;
- plugin or tool-extension architecture;
- scalable approximate vector search for very large libraries;
- optional remote inference profiles with clear privacy boundaries;
- mobile or tablet-optimized annotation.

Each proposal needs a separate product specification before implementation.

---

## 13. Recommended delivery order

### Phase A — reliability release

1. Add deterministic clean-run fixture and smoke test.
2. Add backend route and persistence integration tests.
3. Add frontend regression tests for selection, autosave, deletion, and pages.
4. Version and remove obsolete browser reset logic.
5. Verify builds and document the results.

Expected result: the existing product can be demonstrated repeatedly without
manual cleanup or surprise regressions.

### Phase B — grounded multimodal release

1. Build the vision benchmark.
2. Compare current Gemma behavior with MiniCPM-V and one stronger alternative.
3. Introduce the grounded general prompt.
4. Add deterministic mathematical verification.
5. Adopt a new model route only if measurements justify it.

Expected result: handwritten and visual selections are transcribed more
faithfully, ambiguity is surfaced, and simple mathematics is independently
verified.

### Phase C — evidence and retrieval release

1. Establish RAG evaluation questions.
2. Measure retrieval recall and answer faithfulness.
3. Add inspectable citations to Ask PDF.
4. Tune chunking and neighboring-context expansion from measured failures.
5. Add retrieval diagnostics.

Expected result: document answers are faster to trust because every claim can be
traced back to the open source.

### Phase D — performance and polish release

1. Profile motion and graph physics.
2. Implement operation-specific inference timeout handling.
3. Validate speech persistence and streaming playback.
4. Add settings, diagnostics, first-run guidance, and About.
5. Complete accessibility review.

Expected result: smoother interaction, clearer runtime feedback, and a more
finished application without expanding the core architecture.

### Phase E — V2 design

1. Write the agent/tool contract.
2. Define permissions, provenance, undo, and evaluation.
3. Prototype tool calling outside the production workspace.
4. Compare reliability with the non-agentic pipeline.
5. Proceed only when the prototype produces a measurable benefit.

Expected result: a defensible plan for agentic behavior rather than an
uncontrolled model loop.

---

## 14. Definition of done for future phases

A future phase is complete only when:

- its acceptance criteria pass on a clean local environment;
- backend and frontend typechecks pass;
- the frontend production build succeeds;
- new persistence has a migration and cleanup path;
- user-visible failures have actionable messages;
- the relevant README instructions are updated;
- `.env` and generated local data remain ignored;
- no unrelated sample or test data remains in the normal application;
- commits are scoped and written in natural language;
- the completed phase is pushed to the configured GitHub remote.

## 15. Commands to keep verified

Run Ollama separately:

```sh
ollama serve
```

Run the backend:

```sh
cd backend
bun run dev
```

Run the frontend:

```sh
cd frontend
bun run dev
```

Or start only the two Bun applications from the repository root:

```sh
(cd backend && bun run dev) & (cd frontend && bun run dev) & wait
```

The final `wait` keeps the parent terminal attached to both background
processes so that interruption and exit behavior remain understandable. It is
not needed when backend and frontend are run in separate terminals.

Verification:

```sh
cd backend
bun run typecheck

cd ../frontend
bun run typecheck
bun run build
```
