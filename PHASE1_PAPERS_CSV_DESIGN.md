# ICLR 2026 Phase 1 Design: Papers CSV Extraction

## Understanding Summary

- Build a static-site-friendly local data foundation for navigating `ICLR 2026` papers.
- Phase 1 covers `main conference papers only`, not workshops.
- The first deliverable is a reusable local database centered on a canonical `papers.csv`.
- Each paper row should include list-page metadata, detail-page metadata, and session/schedule data when available.
- Relevance filtering in the later UI should support multiple modes rather than a single hard-coded rule.
- Users will later be able to bookmark papers, save those bookmarks locally, view a basic agenda grouped by day, and export that agenda.
- Phase 1 is intentionally `CSV-first` so a richer static navigator can be built on top of a trusted dataset later.

## Confirmed Scope

### Included in Phase 1

- Extract all main-conference paper records into a local dataset.
- Capture paper detail metadata such as abstract and optional external links.
- Capture session/date/time metadata where exposed by the conference site.
- Produce a canonical flat export as `papers.csv`.
- Produce intermediate machine-friendly artifacts for validation and future UI work.
- Produce a validation summary to measure extraction completeness.

### Explicit Non-Goals

- No workshop ingestion in phase 1.
- No full website implementation in phase 1.
- No bookmark UI in phase 1.
- No backend or hosted database in phase 1.
- No guessed schedule inference when source data is missing or ambiguous.

## Assumptions

- The eventual user-facing product will be a static frontend that consumes local extracted data.
- The conference site exposes enough information across paper and calendar pages to populate most session metadata.
- Browser-local storage will be sufficient for future bookmark persistence.
- Traffic and scale are small enough that no backend is needed.
- Privacy requirements are low because personal bookmarks remain local.
- Conference data refresh can be a manual or script-triggered process rather than a continuously running sync.
- A normalized JSON intermediate format is acceptable even though CSV is the primary artifact.

## Recommended Approach

Use a `CSV-first extraction workflow` with intermediate structured artifacts.

This phase should prioritize a trustworthy local database over UI complexity. The extraction pipeline should gather all papers, enrich each paper from its detail page, and then resolve session metadata from either the paper page or the conference calendar. The final result should be a flat CSV that can be used directly for exploration, spreadsheet analysis, or the later static navigator.

This approach was chosen over a frontend-first build because it reduces design risk. It lets us validate source coverage, field quality, and schedule matching before investing in bookmark UX, filters, or agenda exports. It also keeps the later system flexible because the UI can evolve independently of the data acquisition layer.

## Extraction Architecture

### Stage 1: Index Collection

Collect the universe of paper records from the ICLR paper listing pages.

Required outputs from this stage:

- `paper_id`
- `paper_url`
- `title`
- `authors`
- `topic_tag`
- `source_list_url`

This stage should also persist a raw crawl artifact so missing records can be audited later without rerunning the entire pipeline.

### Stage 2: Detail Enrichment

Visit each paper detail page and extract richer metadata.

Target fields:

- `abstract`
- `project_page`
- `pdf_url`
- `video_url`
- `poster_url`
- `code_url`
- other structured outbound links when present
- `source_detail_url`

This stage should tolerate partial metadata. Missing optional fields should remain empty rather than causing the record to fail.

### Stage 3: Schedule Resolution

Resolve paper presentation metadata from the paper page when possible, otherwise from the conference calendar.

Target fields:

- `session_title`
- `session_type`
- `session_date`
- `session_start`
- `session_end`
- `room`
- `schedule_source`

If schedule information cannot be resolved confidently, fields should remain empty and the record should be marked explicitly as unresolved.

## Canonical CSV Schema

The canonical `papers.csv` should have one row per paper with the following fields:

- `paper_id`
- `paper_url`
- `title`
- `authors`
- `topic_tag`
- `session_title`
- `session_type`
- `session_date`
- `session_start`
- `session_end`
- `room`
- `abstract`
- `project_page`
- `pdf_url`
- `video_url`
- `poster_url`
- `code_url`
- `source_list_url`
- `source_detail_url`
- `schedule_source`
- `scraped_at`
- `status`
- `notes`

The `status` and `notes` fields are important for traceability. They allow incomplete or partially resolved records to remain in the export instead of being silently dropped.

## Intermediate Artifacts

To keep extraction debuggable and reusable, phase 1 should also emit:

- `papers_raw_index.json`
- `papers_enriched.json`
- `extraction_summary.json` or similar validation report

The CSV remains the canonical flat export, while the JSON files support inspection, replay, and future UI/backend work.

## Validation Requirements

The extractor should produce a validation summary containing at least:

- total papers discovered
- total papers enriched
- total papers written to CSV
- total papers with abstracts
- total papers with schedule metadata
- total papers missing required fields
- duplicate URLs or duplicate titles detected

Minimum validation behavior:

- `title` and `paper_url` must be non-empty.
- CSV row count must match final retained paper count.
- Missing optional metadata must be explicit.
- A small number of known papers should be spot-checked manually.

## Non-Functional Defaults

### Performance

- Reasonable local execution time is sufficient.
- The extractor does not need aggressive concurrency in phase 1.

### Scale

- Single-conference dataset only.
- Personal or low-volume usage.

### Security and Privacy

- Low sensitivity dataset.
- No user account system.
- Future bookmarks remain local to the browser.

### Reliability

- Favor explicit missing values over brittle inference.
- Preserve source URLs for every record.

### Maintenance

- Keep the pipeline modular so source-specific parsing can be updated independently.
- Prefer simple matching logic first; defer more advanced heuristics until real failures justify them.

## Key Risks

- Conference pages may change structure over time.
- Paper titles may not match schedule titles exactly.
- Some detail pages may omit optional metadata or session information.
- Calendar-derived schedule matching may need normalization rules later.

## Decision Log

1. `Phase 1 scope`
   - Decided: papers only.
   - Alternatives considered: papers plus workshops.
   - Reason: reduce scope and establish a stable local dataset first.

2. `Primary deliverable`
   - Decided: CSV-first extraction.
   - Alternatives considered: full static site first, live website integration.
   - Reason: trusted data is the critical dependency for everything else.

3. `Filtering philosophy`
   - Decided: later UI should support multiple relevance modes.
   - Alternatives considered: topic-only or keyword-only filtering.
   - Reason: your research exploration needs flexibility.

4. `Bookmark model`
   - Decided: bookmark is paper-only in phase 1 planning.
   - Alternatives considered: bookmark with priority and/or notes.
   - Reason: keep personal planning state minimal initially.

5. `Agenda capability`
   - Decided: future phase should support both a basic agenda view and export file.
   - Alternatives considered: data-only, view-only, export-only.
   - Reason: both are useful once bookmarks exist.

6. `Extraction structure`
   - Decided: three-stage pipeline of index collection, detail enrichment, and schedule resolution.
   - Alternatives considered: one-shot scraper.
   - Reason: better traceability, rerunnability, and debugging.

7. `Missing data policy`
   - Decided: never silently infer or drop missing schedule data.
   - Alternatives considered: heuristic filling without traceability.
   - Reason: data trust matters more than superficial completeness.
