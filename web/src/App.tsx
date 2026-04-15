import {
  type CSSProperties,
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { List, type RowComponentProps } from "react-window";

import { buildCsv, buildIcs, downloadTextFile } from "./lib/export";
import { filterPapers, formatDateLabel, formatScheduleLabel, groupAgenda } from "./lib/filters";
import { bookmarkStorageKey, loadBookmarks, saveBookmarks } from "./lib/storage";
import type { Filters, Paper, PapersPayload } from "./types";

const DEFAULT_FILTERS: Filters = {
  query: "",
  selectedTopics: [],
  selectedDate: "",
  selectedSessionType: "",
  bookmarkedOnly: false,
  scheduledOnly: false,
};

const DATA_URL = `${import.meta.env.BASE_URL}data/papers.json`;
const MOBILE_QUERY = "(max-width: 960px)";

type AppView = "explore" | "agenda";

interface ExplorerUrlState {
  view: AppView;
  paper: string | null;
  filters: Filters;
}

interface PaperListRowData {
  bookmarks: Set<string>;
  onOpen: (paperId: string) => void;
  onToggleBookmark: (paperId: string) => void;
  papers: Paper[];
  selectedPaperId: string | null;
}

export function App() {
  const [data, setData] = useState<PapersPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const response = await fetch(DATA_URL);
        if (!response.ok) {
          throw new Error(`Failed to load papers.json (${response.status})`);
        }
        const payload = (await response.json()) as PapersPayload;
        if (!cancelled) {
          setData(payload);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unknown load error");
        }
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <main className="loading-shell">
        <section className="loading-card">
          <p className="eyebrow">Data Load Failed</p>
          <h1>ICLR 2026 Explorer</h1>
          <p>{error}</p>
          <p>
            Run <code>uv run python -m iclr_explorer.build_web_data</code> before starting the web
            app.
          </p>
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="loading-shell">
        <section className="loading-card">
          <p className="eyebrow">Loading Conference Data</p>
          <h1>ICLR 2026 Explorer</h1>
          <p>Preparing {bookmarkStorageKey()} and your local conference workspace…</p>
        </section>
      </main>
    );
  }

  return <ExplorerApp data={data} />;
}

export function ExplorerApp({ data }: { data: PapersPayload }) {
  const initialUrlStateRef = useRef<ExplorerUrlState | null>(null);
  if (!initialUrlStateRef.current) {
    initialUrlStateRef.current = readExplorerUrlState();
  }

  const initialUrlState = initialUrlStateRef.current;
  const [view, setView] = useState<AppView>(initialUrlState.view);
  const [filters, setFilters] = useState<Filters>(initialUrlState.filters);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(initialUrlState.paper);
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => loadBookmarks());
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(() => Boolean(initialUrlState.paper));
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const viewportHeight = useViewportHeight();
  const deferredQuery = useDeferredValue(filters.query);

  useEffect(() => {
    saveBookmarks(bookmarks);
  }, [bookmarks]);

  const restoreUrlState = useEffectEvent(() => {
    const nextState = readExplorerUrlState();
    setView(nextState.view);
    setFilters(nextState.filters);
    setSelectedPaperId(nextState.paper);
    setIsMobileDetailOpen(nextState.view === "explore" && Boolean(nextState.paper));
    setIsMobileFiltersOpen(false);
  });

  useEffect(() => {
    window.addEventListener("popstate", restoreUrlState);
    return () => {
      window.removeEventListener("popstate", restoreUrlState);
    };
  }, [restoreUrlState]);

  useEffect(() => {
    writeExplorerUrlState({
      view,
      paper: selectedPaperId,
      filters,
    });
  }, [filters, selectedPaperId, view]);

  useEffect(() => {
    if (!isMobile) {
      setIsMobileFiltersOpen(false);
      setIsMobileDetailOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (view !== "explore") {
      setIsMobileFiltersOpen(false);
      setIsMobileDetailOpen(false);
    }
  }, [view]);

  useEffect(() => {
    if (!isMobile || !isMobileDetailOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobile, isMobileDetailOpen]);

  useEffect(() => {
    if (!isMobileDetailOpen) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsMobileDetailOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileDetailOpen]);

  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      query: deferredQuery,
    }),
    [deferredQuery, filters],
  );

  const filteredPapers = useMemo(
    () => filterPapers(data.papers, effectiveFilters, bookmarks),
    [bookmarks, data.papers, effectiveFilters],
  );

  const bookmarkedPapers = useMemo(
    () => data.papers.filter((paper) => bookmarks.has(paper.paper_id)),
    [bookmarks, data.papers],
  );

  const selectedPaper = useMemo(
    () => data.papers.find((paper) => paper.paper_id === selectedPaperId) ?? null,
    [data.papers, selectedPaperId],
  );

  const agenda = useMemo(() => groupAgenda(bookmarkedPapers), [bookmarkedPapers]);

  const bookmarkedVisibleCount = useMemo(
    () => filteredPapers.filter((paper) => bookmarks.has(paper.paper_id)).length,
    [bookmarks, filteredPapers],
  );

  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);
  const generatedLabel = useMemo(() => formatGeneratedLabel(data.generated_at), [data.generated_at]);
  const skippedAgendaCount = useMemo(() => buildIcs(bookmarkedPapers).skippedCount, [bookmarkedPapers]);
  const resultsListHeight = useMemo(
    () =>
      Math.max(
        isMobile ? 420 : 520,
        Math.min(Math.round(viewportHeight * (isMobile ? 0.62 : 0.68)), isMobile ? 720 : 920),
      ),
    [isMobile, viewportHeight],
  );
  const resultsItemSize = isMobile ? 252 : 238;
  const paperListRowData = useMemo<PaperListRowData>(
    () => ({
      bookmarks,
      onOpen: openPaper,
      onToggleBookmark: toggleBookmark,
      papers: filteredPapers,
      selectedPaperId,
    }),
    [bookmarks, filteredPapers, selectedPaperId],
  );

  useEffect(() => {
    if (selectedPaperId && !data.papers.some((paper) => paper.paper_id === selectedPaperId)) {
      setSelectedPaperId(null);
      setIsMobileDetailOpen(false);
    }
  }, [data.papers, selectedPaperId]);

  useEffect(() => {
    if (view !== "explore") {
      return;
    }

    if (filteredPapers.length === 0) {
      setSelectedPaperId(null);
      setIsMobileDetailOpen(false);
      return;
    }

    if (!selectedPaperId) {
      if (!isMobile) {
        setSelectedPaperId(filteredPapers[0].paper_id);
      }
      return;
    }

    const selectedStillVisible = filteredPapers.some((paper) => paper.paper_id === selectedPaperId);
    if (selectedStillVisible) {
      return;
    }

    if (isMobile) {
      setSelectedPaperId(null);
      setIsMobileDetailOpen(false);
      return;
    }

    setSelectedPaperId(filteredPapers[0].paper_id);
  }, [filteredPapers, isMobile, selectedPaperId, view]);

  function updateFilters(nextValue: Partial<Filters>) {
    startTransition(() => {
      setFilters((current) => ({
        ...current,
        ...nextValue,
      }));
    });
  }

  function handleViewChange(nextView: AppView) {
    setView(nextView);
    if (nextView !== "explore") {
      setIsMobileFiltersOpen(false);
      setIsMobileDetailOpen(false);
    }
  }

  function toggleTopic(topic: string) {
    setFilters((current) => {
      const nextTopics = current.selectedTopics.includes(topic)
        ? current.selectedTopics.filter((value) => value !== topic)
        : [...current.selectedTopics, topic];
      return {
        ...current,
        selectedTopics: nextTopics,
      };
    });
  }

  function toggleBookmark(paperId: string) {
    startTransition(() => {
      setBookmarks((current) => {
        const next = new Set(current);
        if (next.has(paperId)) {
          next.delete(paperId);
        } else {
          next.add(paperId);
        }
        return next;
      });
    });
  }

  function bookmarkVisibleResults() {
    startTransition(() => {
      setBookmarks((current) => {
        const next = new Set(current);
        for (const paper of filteredPapers) {
          next.add(paper.paper_id);
        }
        return next;
      });
    });
  }

  function clearVisibleBookmarks() {
    startTransition(() => {
      setBookmarks((current) => {
        const next = new Set(current);
        for (const paper of filteredPapers) {
          next.delete(paper.paper_id);
        }
        return next;
      });
    });
  }

  function openPaper(paperId: string) {
    setSelectedPaperId(paperId);
    if (view !== "explore") {
      setView("explore");
    }
    if (isMobile) {
      setIsMobileDetailOpen(true);
    }
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  function exportBookmarksCsv() {
    const content = buildCsv(data.columns, bookmarkedPapers);
    downloadTextFile("iclr-2026-bookmarks.csv", content, "text/csv;charset=utf-8");
  }

  function exportBookmarksIcs() {
    const { content } = buildIcs(bookmarkedPapers);
    downloadTextFile("iclr-2026-bookmarks.ics", content, "text/calendar;charset=utf-8");
  }

  const headerContextLabel =
    view === "explore"
      ? `${filteredPapers.length.toLocaleString()} papers in the current lens`
      : `${bookmarkedPapers.length.toLocaleString()} saved papers in your local plan`;

  return (
    <main className="app-shell">
      <a className="skip-link" href="#results-panel">
        Skip to Results
      </a>
      <div className="backdrop-grid" />

      <header className="command-header">
        <div className="command-header-top">
          <div className="brand-block">
            <p className="eyebrow">ICLR 2026 field planner</p>
            <h1>Find the right sessions fast.</h1>
            <p className="command-copy">
              Search the full program, pin the papers that matter, and build a clean local agenda
              without wrestling with the conference site.
            </p>
          </div>

          <dl className="stat-strip">
            <div className="stat-pill">
              <dt>Papers</dt>
              <dd>{data.total_papers.toLocaleString()}</dd>
            </div>
            <div className="stat-pill">
              <dt>Scheduled</dt>
              <dd>{(data.total_papers - data.unresolved_schedule_count).toLocaleString()}</dd>
            </div>
            <div className="stat-pill">
              <dt>Saved</dt>
              <dd>{bookmarks.size.toLocaleString()}</dd>
            </div>
          </dl>
        </div>

        <div className="command-bar">
          <div className="toolbar-tabs" role="tablist" aria-label="Primary views">
            <button
              className={view === "explore" ? "tab is-active" : "tab"}
              onClick={() => handleViewChange("explore")}
              role="tab"
              aria-selected={view === "explore"}
              type="button"
            >
              Explore
            </button>
            <button
              className={view === "agenda" ? "tab is-active" : "tab"}
              onClick={() => handleViewChange("agenda")}
              role="tab"
              aria-selected={view === "agenda"}
              type="button"
            >
              Agenda
            </button>
          </div>

          <label className="search-shell">
            <span className="search-label">Primary Search</span>
            <input
              className="search-input"
              type="search"
              aria-label="Search papers"
              name="q"
              autoComplete="off"
              value={filters.query}
              onChange={(event) => updateFilters({ query: event.target.value })}
              placeholder="Reasoning, multimodal, safety…"
            />
          </label>

          {view === "explore" && isMobile ? (
            <button
              className="ghost-button filter-disclosure"
              onClick={() => setIsMobileFiltersOpen((current) => !current)}
              type="button"
            >
              {isMobileFiltersOpen
                ? "Hide Filters"
                : `Filters${activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}`}
            </button>
          ) : (
            <div className="header-context-pill">{headerContextLabel}</div>
          )}
        </div>

        <div className="header-meta">
          <span>{headerContextLabel}</span>
          <span>{data.unresolved_schedule_count.toLocaleString()} papers still need schedule metadata.</span>
          {generatedLabel ? <span>Updated {generatedLabel}</span> : null}
        </div>
      </header>

      {view === "explore" ? (
        <section className="explore-layout">
          {!isMobile || isMobileFiltersOpen ? (
            <aside className={isMobile ? "filters-card is-mobile-open" : "filters-card"}>
              <div className="filters-header">
                <div>
                  <p className="eyebrow">Refine</p>
                  <h2>Filters</h2>
                </div>
                <button className="ghost-button" onClick={resetFilters} type="button">
                  Clear All
                </button>
              </div>

              <p className="filters-note">
                Narrow the paper wall by day, format, saved status, and topic clusters.
              </p>

              <div className="filter-row">
                <label className="field">
                  <span>Date</span>
                  <select
                    name="date"
                    value={filters.selectedDate}
                    onChange={(event) => updateFilters({ selectedDate: event.target.value })}
                  >
                    <option value="">All conference days</option>
                    {data.session_dates.map((date) => (
                      <option key={date} value={date}>
                        {formatDateLabel(date)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Session Type</span>
                  <select
                    name="sessionType"
                    value={filters.selectedSessionType}
                    onChange={(event) => updateFilters({ selectedSessionType: event.target.value })}
                  >
                    <option value="">All formats</option>
                    {data.session_types.map((sessionType) => (
                      <option key={sessionType} value={sessionType}>
                        {sessionType}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="toggle-stack">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={filters.bookmarkedOnly}
                    onChange={(event) => updateFilters({ bookmarkedOnly: event.target.checked })}
                  />
                  <span>Saved papers only</span>
                </label>

                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={filters.scheduledOnly}
                    onChange={(event) => updateFilters({ scheduledOnly: event.target.checked })}
                  />
                  <span>Scheduled sessions only</span>
                </label>
              </div>

              <div className="topic-panel">
                <div className="filters-header">
                  <h3>Topic Clusters</h3>
                  <span>{filters.selectedTopics.length} active</span>
                </div>
                <div className="topic-grid">
                  {data.topic_tags.map((topic) => {
                    const selected = filters.selectedTopics.includes(topic);
                    return (
                      <button
                        key={topic}
                        className={selected ? "topic-chip is-selected" : "topic-chip"}
                        onClick={() => toggleTopic(topic)}
                        type="button"
                      >
                        {topic}
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>
          ) : null}

          <section className="results-column" id="results-panel" aria-live="polite">
            <div className="results-toolbar">
              <div>
                <p className="eyebrow">Explore</p>
                <h2>
                  {filteredPapers.length > 0
                    ? `${filteredPapers.length.toLocaleString()} papers in view.`
                    : "No papers match the current lens."}
                </h2>
              </div>
              <div className="bulk-actions">
                <button className="action-button" onClick={bookmarkVisibleResults} type="button">
                  Save Visible ({filteredPapers.length.toLocaleString()})
                </button>
                <button className="ghost-button" onClick={clearVisibleBookmarks} type="button">
                  Clear Visible ({bookmarkedVisibleCount.toLocaleString()})
                </button>
              </div>
            </div>

            {filteredPapers.length > 0 ? (
              <List
                className="paper-vlist"
                rowComponent={PaperListRow}
                rowCount={filteredPapers.length}
                rowHeight={resultsItemSize}
                rowProps={paperListRowData}
                overscanCount={6}
                style={{ height: resultsListHeight, width: "100%" }}
              />
            ) : (
              <div className="empty-state">
                <p className="eyebrow">Nothing in View</p>
                <h3>Try a broader filter combination.</h3>
                <p>
                  The current query and refine controls filter out every paper. Clear the filters or
                  loosen the search terms.
                </p>
                <button className="action-button" onClick={resetFilters} type="button">
                  Reset Filters
                </button>
              </div>
            )}
          </section>

          {!isMobile ? (
            <aside className="detail-panel">
              {selectedPaper ? (
                <PaperDetail paper={selectedPaper} />
              ) : (
                <div className="empty-state detail-empty-state">
                  <p className="eyebrow">No Selection</p>
                  <h3>Filter down to a paper to inspect the detail pane.</h3>
                  <p>The detail pane tracks the selected result and keeps deep links stable via the URL.</p>
                </div>
              )}
            </aside>
          ) : null}
        </section>
      ) : (
        <section className="agenda-layout">
          <div className="agenda-toolbar">
            <div>
              <p className="eyebrow">Agenda</p>
              <h2>{bookmarkedPapers.length.toLocaleString()} saved papers in your local plan.</h2>
            </div>

            <div className="bulk-actions">
              <button
                className="ghost-button"
                onClick={exportBookmarksCsv}
                disabled={bookmarkedPapers.length === 0}
                type="button"
              >
                Export CSV
              </button>
              <button
                className="action-button"
                onClick={exportBookmarksIcs}
                disabled={bookmarkedPapers.length === 0}
                type="button"
              >
                Export ICS
              </button>
            </div>
          </div>

          {bookmarkedPapers.length === 0 ? (
            <div className="empty-state agenda-empty-state">
              <p className="eyebrow">Nothing Saved Yet</p>
              <h3>Start in Explore and save the papers worth tracking.</h3>
              <p>
                Your agenda fills itself from saved papers. Once you shortlist a few results, this
                view becomes a clean schedule board and export hub.
              </p>
              <button className="action-button" onClick={() => handleViewChange("explore")} type="button">
                Open Explore
              </button>
            </div>
          ) : (
            <>
              <p className="agenda-note">
                {skippedAgendaCount > 0
                  ? `${skippedAgendaCount} saved papers are still missing enough schedule metadata for ICS export.`
                  : "All saved papers have enough schedule metadata for ICS export."}
              </p>

              {agenda.scheduledGroups.map((group) => (
                <section key={group.date} className="agenda-day">
                  <header className="agenda-day-header">
                    <p className="eyebrow">Conference Day</p>
                    <h3>{group.label}</h3>
                  </header>
                  <div className="agenda-grid">
                    {group.papers.map((paper) => (
                      <article key={paper.paper_id} className="agenda-card">
                        <div className="agenda-card-topline">
                          <span className="paper-badge">{paper.session_type || "Paper"}</span>
                          <span className="agenda-time">
                            {paper.session_start || "TBD"}
                            {paper.session_end ? `-${paper.session_end}` : ""}
                          </span>
                        </div>
                        <h4>{paper.title}</h4>
                        <p>{paper.authors || "Authors unavailable"}</p>
                        <p>{paper.room || "Room pending"}</p>
                        <button
                          className="ghost-button"
                          onClick={() => openPaper(paper.paper_id)}
                          type="button"
                        >
                          Open in Explore
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              ))}

              {agenda.unscheduled.length > 0 ? (
                <section className="agenda-day">
                  <header className="agenda-day-header">
                    <p className="eyebrow">Needs Manual Follow-Up</p>
                    <h3>Unscheduled saved papers</h3>
                  </header>
                  <div className="agenda-grid">
                    {agenda.unscheduled.map((paper) => (
                      <article key={paper.paper_id} className="agenda-card is-unscheduled">
                        <div className="agenda-card-topline">
                          <span className="paper-badge">Pending</span>
                        </div>
                        <h4>{paper.title}</h4>
                        <p>{paper.authors || "Authors unavailable"}</p>
                        <p>{paper.notes || "No schedule metadata yet."}</p>
                        <button
                          className="ghost-button"
                          onClick={() => openPaper(paper.paper_id)}
                          type="button"
                        >
                          Open in Explore
                        </button>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </section>
      )}

      {isMobile && view === "explore" && selectedPaper && isMobileDetailOpen ? (
        <div
          className="mobile-sheet-backdrop"
          onClick={() => setIsMobileDetailOpen(false)}
          role="presentation"
        >
          <section
            className="mobile-detail-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={selectedPaper.title}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mobile-sheet-header">
              <div>
                <p className="eyebrow">Paper Detail</p>
                <h2>{selectedPaper.title}</h2>
              </div>
              <button
                className="ghost-button close-button"
                onClick={() => setIsMobileDetailOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <PaperDetail paper={selectedPaper} />
          </section>
        </div>
      ) : null}
    </main>
  );
}

function PaperCard({
  paper,
  isBookmarked,
  isSelected,
  onOpen,
  onToggleBookmark,
  style,
}: {
  paper: Paper;
  isBookmarked: boolean;
  isSelected: boolean;
  onOpen: () => void;
  onToggleBookmark: () => void;
  style?: CSSProperties;
}) {
  return (
    <article className={isSelected ? "paper-card is-selected" : "paper-card"} style={style}>
      <div className="paper-card-topline">
        <span className="paper-badge">{paper.session_type || "Paper"}</span>
        <button
          className={isBookmarked ? "bookmark-button is-on" : "bookmark-button"}
          onClick={onToggleBookmark}
          aria-label={`${isBookmarked ? "Remove bookmark for" : "Save bookmark for"} ${paper.title}`}
          aria-pressed={isBookmarked}
          type="button"
        >
          {isBookmarked ? "Saved" : "Save"}
        </button>
      </div>

      <button
        className="paper-card-button"
        onClick={onOpen}
        aria-pressed={isSelected}
        type="button"
      >
        <span className="paper-card-title">{paper.title}</span>
        <span className="paper-authors">{paper.authors || "Authors unavailable"}</span>
        <span className="paper-schedule">{formatScheduleLabel(paper)}</span>
        {paper.topic_tags.length > 0 ? (
          <span className="paper-tags">
            {paper.topic_tags.slice(0, 3).map((topic) => (
              <span key={topic} className="tag">
                {topic}
              </span>
            ))}
          </span>
        ) : null}
      </button>
    </article>
  );
}

function PaperListRow({
  ariaAttributes,
  bookmarks,
  index,
  onOpen,
  onToggleBookmark,
  papers,
  selectedPaperId,
  style,
}: RowComponentProps<PaperListRowData>) {
  const paper = papers[index];
  if (!paper) {
    return null;
  }

  return (
    <div
      {...ariaAttributes}
      style={{
        ...style,
        height: Number(style.height) - 14,
        width: "100%",
      }}
    >
      <PaperCard
        paper={paper}
        isBookmarked={bookmarks.has(paper.paper_id)}
        isSelected={selectedPaperId === paper.paper_id}
        onOpen={() => onOpen(paper.paper_id)}
        onToggleBookmark={() => onToggleBookmark(paper.paper_id)}
        style={{ height: "100%" }}
      />
    </div>
  );
}

function PaperDetail({ paper }: { paper: Paper }) {
  return (
    <div className="paper-detail">
      <p className="eyebrow">Selected Paper</p>
      <h2>{paper.title}</h2>
      <p className="detail-authors">{paper.authors || "Authors unavailable"}</p>
      <p className="detail-schedule">{formatScheduleLabel(paper)}</p>

      <div className="detail-links">
        <ExternalLink href={paper.paper_url} label="Paper page" />
        <ExternalLink href={paper.project_page} label="Project" />
        <ExternalLink href={paper.pdf_url} label="PDF" />
        <ExternalLink href={paper.video_url} label="Video" />
        <ExternalLink href={paper.poster_url} label="Poster" />
        <ExternalLink href={paper.code_url} label="Code" />
      </div>

      {paper.topic_parts.length > 0 ? (
        <div className="detail-topics">
          {paper.topic_parts.map((topic) => (
            <div key={topic.raw} className="topic-block">
              <span>{topic.group || "Topic"}</span>
              <strong>{topic.name}</strong>
            </div>
          ))}
        </div>
      ) : null}

      <section className="detail-abstract">
        <h3>Abstract</h3>
        <p>{paper.abstract || "Abstract unavailable."}</p>
      </section>
    </div>
  );
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  if (!href) {
    return null;
  }
  return (
    <a className="link-pill" href={href} target="_blank" rel="noreferrer">
      {label}
    </a>
  );
}

function countActiveFilters(filters: Filters): number {
  return [
    filters.selectedDate,
    filters.selectedSessionType,
    filters.bookmarkedOnly ? "bookmarked" : "",
    filters.scheduledOnly ? "scheduled" : "",
    filters.selectedTopics.length > 0 ? "topics" : "",
  ].filter(Boolean).length;
}

function formatGeneratedLabel(value: string): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date)} UTC`;
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(query) as MediaQueryList & {
      addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
      removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
    };
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    setMatches(mediaQuery.matches);
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => {
        mediaQuery.removeEventListener("change", handleChange);
      };
    }
    mediaQuery.addListener?.(handleChange);
    return () => {
      mediaQuery.removeListener?.(handleChange);
    };
  }, [query]);

  return matches;
}

function useViewportHeight(): number {
  const [height, setHeight] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 900,
  );

  useEffect(() => {
    const handleResize = () => {
      setHeight(window.innerHeight);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return height;
}

function readExplorerUrlState(): ExplorerUrlState {
  if (typeof window === "undefined") {
    return {
      view: "explore",
      paper: null,
      filters: DEFAULT_FILTERS,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const topicValue = params.get("topics") ?? "";

  return {
    view: params.get("view") === "agenda" ? "agenda" : "explore",
    paper: params.get("paper"),
    filters: {
      query: params.get("q") ?? "",
      selectedTopics: topicValue ? topicValue.split(",").filter(Boolean) : [],
      selectedDate: params.get("date") ?? "",
      selectedSessionType: params.get("sessionType") ?? "",
      bookmarkedOnly: params.get("bookmarked") === "1",
      scheduledOnly: params.get("scheduled") === "1",
    },
  };
}

function writeExplorerUrlState(state: ExplorerUrlState): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  setUrlParam(url.searchParams, "view", state.view === "agenda" ? "agenda" : "");
  setUrlParam(url.searchParams, "paper", state.paper);
  setUrlParam(url.searchParams, "q", state.filters.query);
  setUrlParam(url.searchParams, "date", state.filters.selectedDate);
  setUrlParam(url.searchParams, "sessionType", state.filters.selectedSessionType);
  setUrlParam(url.searchParams, "topics", state.filters.selectedTopics.join(","));
  setUrlParam(url.searchParams, "bookmarked", state.filters.bookmarkedOnly ? "1" : "");
  setUrlParam(url.searchParams, "scheduled", state.filters.scheduledOnly ? "1" : "");
  window.history.replaceState({}, "", url);
}

function setUrlParam(params: URLSearchParams, key: string, value: string | null): void {
  if (!value) {
    params.delete(key);
    return;
  }
  params.set(key, value);
}
