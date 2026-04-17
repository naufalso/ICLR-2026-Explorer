# ICLR 2026 Explorer

ICLR 2026 Explorer is a small data pipeline plus a frontend explorer for browsing conference content. Poster and oral paper extraction, normalization, schedule enrichment, and a searchable web UI are in place.

The repository is still in progress. Poster and oral paper plus workshop support are complete for the current phase, while invited talks, and a dedicated calendar view are planned next.

## Current Status

- [x] Poster paper extraction from the ICLR virtual site
- [x] Oral presentation coverage with paired oral/poster paper rows
- [x] Canonical CSV and JSON artifacts under `data/iclr2026/`
- [x] Frontend-ready payload generation for the web app
- [x] React explorer with search, filters, bookmarks, agenda view, and CSV/ICS export
- [x] Dedicated workshop extractor and separate workshop explorer
- [x] GitHub Pages deployment workflow for the frontend
- [ ] Invited talks
- [ ] Calendar view

## Repository Layout

```text
.
├── data/iclr2026/              # Generated paper and workshop artifacts
├── src/iclr_explorer/          # Python extraction and transform pipeline
├── tests/                      # Python fixture-based tests
├── web/                        # Vite + React frontend
└── .github/workflows/          # GitHub Pages deployment
```

## What Exists Today

### Data pipeline

The Python package in [`src/iclr_explorer`](src/iclr_explorer) currently handles poster-oral paper data and workshop event data:

- `extract_papers.py`
  Downloads the ICLR paper index, fetches poster detail pages, derives linked oral presentations, applies schedule information from detail pages, the oral events page, and the conference calendar, then writes canonical artifacts.
- `build_web_data.py`
  Converts the canonical CSV into a frontend-friendly JSON payload consumed by the web app.
- `extract_workshops.py`
  Downloads the ICLR workshop listing, fetches workshop detail pages, and writes canonical workshop artifacts.
- `build_workshop_web_data.py`
  Converts the canonical workshop CSV into a frontend-friendly JSON payload for the dedicated workshop view.
- `models.py`
  Defines the paper and workshop schemas used across CSV and JSON outputs.

### Frontend

The app in [`web/`](web) currently supports:

- full-text search over titles, authors, topics, abstracts, sessions, and rooms
- filtering by topic, date, and session type
- bookmarked papers stored locally in the browser
- agenda grouping for bookmarked scheduled papers
- CSV export of visible results
- ICS export of bookmarked scheduled papers
- a separate workshop browser with its own search, date, room, saved-only, and schedule filters
- local workshop saving plus CSV/ICS export for saved workshop events

## Tech Stack

- Python 3.11+
- `uv` for Python environment and dependency management
- React 19
- TypeScript
- Vite
- Vitest + Testing Library
- GitHub Pages for static deployment

## Getting Started

### Prerequisites

- Python 3.11 or newer
- `uv`
- Node.js 20 or newer
- npm

### 1. Clone the repository

```bash
git clone https://github.com/naufalso/ICLR-2026-Explorer.git
cd ICLR-2026-Explorer
```

### 2. Install Python dependencies

Use the project `uv` environment by default:

```bash
uv sync
```

### 3. Install frontend dependencies

```bash
cd web
npm ci
cd ..
```

## Common Workflows

### Rebuild the web payload from the canonical CSV

```bash
uv run python -m iclr_explorer.build_web_data
```

This reads `data/iclr2026/papers.csv` and writes `web/public/data/papers.json`.

### Rebuild the workshop web payload

```bash
uv run python -m iclr_explorer.build_workshop_web_data
```

This reads `data/iclr2026/workshops.csv` and writes `web/public/data/workshops.json`.

### Re-run the poster-paper extractor

```bash
uv run python -m iclr_explorer.extract_papers
```

Useful options:

```bash
uv run python -m iclr_explorer.extract_papers --limit 20
uv run python -m iclr_explorer.extract_papers --refresh
```

The extractor writes:

- `data/iclr2026/papers.csv`
- `data/iclr2026/papers_raw_index.json`
- `data/iclr2026/papers_enriched.json`
- `data/iclr2026/extraction_summary.json`

### Re-run the workshop extractor

```bash
uv run python -m iclr_explorer.extract_workshops
```

Useful options:

```bash
uv run python -m iclr_explorer.extract_workshops --limit 10
uv run python -m iclr_explorer.extract_workshops --refresh
```

The workshop extractor writes:

- `data/iclr2026/workshops.csv`
- `data/iclr2026/workshops_raw_index.json`
- `data/iclr2026/workshops_enriched.json`
- `data/iclr2026/workshops_extraction_summary.json`

### Run the frontend locally

```bash
cd web
npm run dev
```

### Run tests

Python:

```bash
uv run python -m unittest discover -s tests
```

Frontend:

```bash
cd web
npm test
```

## Data Model Notes

The canonical paper records currently include fields such as:

- paper identity and URLs
- title and authors
- topic tags
- session title, type, date, and time
- room
- abstract
- project, PDF, video, poster, and code links when available
- extraction status and notes

The frontend build step adds convenience fields such as:

- `authors_list`
- `topic_tags`
- `topic_parts`
- `has_schedule`
- `search_blob`

Workshop records include:

- workshop identity and URLs
- title and organizers
- event type, date, time, timezone, and room
- summary and project page
- extraction status and notes

## Deployment

The repository includes a GitHub Pages workflow at [`deploy-pages.yml`](.github/workflows/deploy-pages.yml).

On pushes to `main`, the workflow:

1. installs frontend dependencies
2. builds the Vite app
3. publishes `web/dist` to GitHub Pages

The Pages build uses `VITE_BASE_PATH` so the app can be hosted under the repository path.

## Roadmap

Near-term work is intentionally incremental:

- [x] Keep poster-paper extraction and browsing stable
- [x] Add workshop coverage as a separate explorer
- [x] Add oral-session coverage
- [ ] Add invited-talk coverage
- [ ] Add calendar view
- [ ] Unify all conference content into a broader schedule explorer

## Notes

- Papers and workshops are intentionally separate in the UI right now; workshops have their own saved state and their own CSV/ICS export path.
- Oral-accepted papers currently appear as two rows in the canonical dataset and UI: one `Poster` row and one `Oral` row.
- Calendar exports use the conference schedule fields present in the generated data.
- If `web/public/data/papers.json` or `web/public/data/workshops.json` is missing or stale, rebuild them before running the frontend.
