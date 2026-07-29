# ScholarLM — Remaining Work

Last updated: 30 July 2026

This file tracks work that is still unfinished. Completed features are listed
briefly so that future sessions do not rebuild them.

## Current baseline

ScholarLM currently has:

- page-aware PDF extraction, chunking, embeddings, and Ask PDF retrieval;
- repeated watermark/header filtering during ingestion;
- PDF-linked and standalone tldraw canvases saved in SQLite;
- browser recovery copies for canvases and linked notes;
- explanation of PDF text, canvas text, handwriting, and screenshots;
- cached explanations for unchanged selections;
- cleanup of unsaved explanations when their source ink is deleted;
- movable, expandable, theme-aware explanation stickies;
- sticky-note indexing alongside PDF chunks;
- fuzzy search identifiers for PDFs, canvases, stickies, and handwriting;
- a global and document-specific knowledge graph;
- exact navigation from graph/search results back to canvas shapes;
- deterministic plotting for a limited set of recognized equations;
- grouped graph objects with native canvas movement, resize, and rotation;
- source-linked graph replacement and invalidation;
- local Kokoro speech with browser speech fallback;
- confirmed deletion of documents, notes, canvases, and graph nodes;
- cleanup of affiliated files, indexes, graph edges, explanations, and browser
  recovery data;
- per-document persistence for Explain, Ask, Search, Notes, and Graph panels;
- a responsive sidebar that shifts the page instead of covering it.

## Before the demo

These are the highest-priority tasks.

### Run one complete clean-data test

Use a small PDF with known text, several pages, one printed equation, and a
repeated header or watermark.

Verify:

1. Upload and open the PDF before indexing finishes.
2. Wait for extraction, embeddings, and graph generation.
3. Ask a question whose answer is known to appear on a later page.
4. Open its citation and confirm that the question and answer remain visible.
5. Search for the same idea using different wording.
6. Select PDF text and generate an explanation.
7. Draw an equation, explain it, and insert a graph.
8. Move, resize, and rotate the graph as one object.
9. Save an explanation as a sticky and find it through search.
10. Open the sticky and handwriting from the knowledge graph.
11. Reload and confirm that the canvas, inspector state, and notes survive.
12. Delete the test data and confirm that it does not return from browser
    storage.

Record failures with the exact page, selection, equation, and request time.

### Check provider failure behavior

The free OpenRouter route occasionally returns provider or connection errors.
The application now retries short transient failures, but the following still
needs testing:

- a retry must not duplicate streamed text;
- a failed request must keep the current selection;
- cached explanations must remain available during an outage;
- a failed visual request must not reuse an older screenshot;
- the UI must show a useful error instead of the provider's raw response.

### Check speech on the demo machine

Kokoro can take time to initialize and may not load on every machine.

Before recording:

- warm the model once;
- confirm pause, resume, replay, and stop;
- compare word highlighting with punctuation and paragraph pauses;
- confirm browser fallback behavior;
- keep auto-read disabled if speech is not reliable enough for the demo.

## Math Notes-style interaction

The safe plotting foundation exists, but the Apple Math Notes/Samsung Notes
interaction is not complete.

### What works

- selected ink or text can be sent for recognition;
- the recognized equation is displayed and can be corrected;
- supported equations are parsed without executing arbitrary code;
- plot points are generated deterministically;
- discontinuities such as `y = 1/x` are split;
- `y = sin(x)`, `y = x²`, simple explicit functions, and origin-centered
  circles are supported;
- a graph can be inserted or replaced;
- the generated graph is one movable, resizable, rotatable canvas group;
- editing the source equation invalidates its linked graph.

### What is still missing

- an optional **Math mode** that does not interpret ordinary sketches;
- grouping nearby pen strokes after a short idle delay;
- automatic recognition without requiring a lasso;
- an **Insert graph** chip beside a recognized equation;
- inline calculation when an expression ends with `=`;
- recognition confidence and an explicit correction step for uncertain ink;
- `Solve`, `Insert graph`, `Replace graph`, and `Add to graph` actions on a
  selected equation;
- multiple equations on one graph with colors and a legend;
- domain and range controls;
- coordinate tracing and point inspection;
- more implicit relations than the current circle case;
- a visible connector or shared movement rule between source ink and graph;
- separate recognition errors, parsing errors, and plotting errors in the UI.

### Intended pipeline

```text
Math mode enabled
        ↓
Nearby strokes settle
        ↓
Equation is transcribed
        ↓
User confirms uncertain symbols
        ↓
Expression is classified
        ↓
Deterministic solve or plot
        ↓
Result remains linked to the source ink
```

The language model may explain a verified result, but it should not invent graph
points.

### Optional Desmos integration

Embedding Desmos is possible and would provide a mature equation list, sliders,
implicit plots, zooming, tracing, and multiple colored expressions.

Possible approaches:

1. Show Desmos in the document inspector as an interactive preview.
2. Put an interactive Desmos calculator inside a custom tldraw shape.
3. Use Desmos for editing, then export a static or native canvas graph.

This is not planned for the current demo.

Reasons to defer it:

- the Desmos API requires a key and is governed by separate usage terms;
- production or commercial use may require a paid plan;
- it introduces an external runtime dependency;
- an interactive calculator inside tldraw creates pointer and keyboard
  conflicts;
- calculator state, canvas persistence, export, and rotation need additional
  handling;
- the existing deterministic graph engine is easier to audit in the report.

The preferred future direction is a small Desmos-like equation panel built on
the existing parser: editable rows, show/hide colors, domains, overlays, a
legend, zoom, and trace. Actual Desmos embedding can be reconsidered if the
project needs broader mathematical coverage.

## Retrieval and Ask PDF

Page-aware retrieval works, but it needs a repeatable evaluation rather than
spot checks.

Create a small question set for each test PDF:

- direct factual questions;
- paraphrased questions;
- questions whose answer is on a known later page;
- questions requiring two nearby chunks;
- questions that are not answered by the document;
- questions affected by repeated headers or watermarks.

Measure:

- whether the correct page appears in the top results;
- whether the final answer is supported by the shown sources;
- first-query and warm-query latency;
- false answers for absent information;
- whether opening a citation preserves the Ask conversation.

Remaining improvements:

- highlight the exact supporting passage, not only the page;
- show retrieval confidence in a readable form;
- allow a user to inspect all chunks used for an answer;
- add OCR fallback for image-only PDFs;
- improve handling of tables, equations, and multi-column layouts;
- add a deterministic regression set for the page-11-style retrieval failure.

## Screenshot and handwriting recognition

The screenshot path now sends the current image and treats it as a selection,
but recognition quality has not been benchmarked.

Build a small fixture set containing:

- neat handwriting;
- messy handwriting;
- similar symbols such as `1/l`, `0/O`, and `x/×`;
- superscripts, roots, fractions, and brackets;
- dark and light canvas backgrounds;
- printed equations captured from a PDF;
- non-mathematical sketches that should not be classified as equations.

Record exact transcription accuracy separately from explanation quality.

Remaining work:

- store a stable content fingerprint independent of canvas theme;
- expose uncertainty from visual recognition;
- allow equation correction before requesting a full explanation;
- avoid sending screenshots larger than necessary;
- test screenshot upload, clipboard paste, cancel, retry, and replacement flows.

## Knowledge graph

The graph is useful, but its quality and stability still need measurement.

Remaining work:

- keep stable concept IDs across a rebuild where possible;
- merge semantically identical concepts produced with different wording;
- inspect and reject malformed model-generated relationships;
- show provenance for concept nodes;
- add undo or a short recovery window after destructive graph deletion;
- profile ForceAtlas2 on larger libraries;
- stop layout work as soon as the graph is visually stable;
- test the zero-width container guard during every route transition;
- decide whether raw drawing-page nodes and recognized-equation nodes should be
  merged into one expandable item.

## Search and sticky indexing

Remaining work:

- add automated tests proving that new, edited, and deleted stickies update the
  index;
- make standalone-canvas stickies first-class indexed items;
- expose why a fuzzy or semantic result matched;
- add filters for PDF, canvas, sticky, handwriting, and concept;
- benchmark re-indexing after a large note edit;
- provide an index-health indicator when embedding calls are unavailable.

## Persistence and data lifecycle

The current SQLite schema is migrated at startup. Before treating the project
as production-ready:

- introduce numbered migration files;
- add automatic SQLite backups;
- document database recovery;
- test revision conflicts between two browser tabs;
- prune orphaned speech-cache entries;
- cap explanation-history growth per source;
- define retention rules for uploaded screenshots;
- test deletion during active ingestion;
- make file deletion and database deletion recoverable as one operation;
- add an optional trash/recovery period instead of immediate permanent
  deletion.

## Testing

There is currently more manual verification than automated coverage.

Add:

- unit tests for the restricted math parser and sampler;
- unit tests for watermark filtering and text chunking;
- database tests for canvas revision conflicts and cascade deletion;
- API tests for explanation caching and source-shape cleanup;
- tests for graph-node deduplication;
- component tests for screenshot input mode and inspector persistence;
- an end-to-end browser test for upload → Ask → explain → sticky → graph →
  reload → delete.

Tests must use a temporary database and upload directory. They must not modify
the developer's local library.

## Interface and accessibility

Remaining work:

- test the workspace at common laptop and tablet widths;
- add a mobile-specific layout rather than compressing the desktop workspace;
- verify keyboard access for every inspector tab and confirmation dialog;
- trap focus inside destructive confirmation dialogs;
- restore focus after a dialog closes;
- add reduced-motion behavior to canvas and graph transitions;
- check light-theme contrast for graph labels and explanation controls;
- verify that sidebar animation does not resize Sigma or the PDF to zero;
- add accessible labels for graph manipulation and generated equation controls.

## Hosting and security

The current build is best suited to a local demonstration.

A hosted version still needs:

- a Bun-compatible backend;
- persistent SQLite or a managed database;
- durable PDF storage;
- HTTPS and strict origin configuration;
- upload quotas and rate limits;
- API-key protection and request budgets;
- authentication and per-user data isolation;
- a privacy policy covering PDF, screenshot, and model-provider data.

Supabase, OAuth, and multi-user collaboration remain deferred. They should only
be introduced if a hosted version is actually required.

## Report evaluation

For the IEEE-format report, collect evidence rather than relying only on feature
screenshots.

Useful measurements:

- PDF ingestion time by page count;
- embedding time and vector count;
- Ask PDF top-page accuracy on a fixed question set;
- grounded versus unsupported answer rate;
- handwriting transcription accuracy;
- deterministic graph correctness for supported equations;
- warm and cold explanation latency;
- canvas save and reload success;
- graph size and stabilization time;
- deletion-cascade correctness;
- speech generation latency and fallback rate.

Also document failures honestly: provider outages, unsupported equations,
image-only PDFs, uncertain handwriting, and local deployment constraints.

## Deferred ideas

These are not required for the current project:

- multi-user real-time collaboration;
- cloud synchronization;
- Supabase authentication;
- arbitrary symbolic algebra;
- 3D graphing;
- differential equations;
- automatic execution of user-written code;
- replacing the tldraw license or bypassing its production requirements;
- commercial Desmos integration without an appropriate API agreement.
