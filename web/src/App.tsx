import {
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
} from "react";

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

type AppView = "explore" | "agenda";

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
          <p className="eyebrow">Data load failed</p>
          <h1>ICLR 2026 Explorer</h1>
          <p>{error}</p>
          <p>Run <code>uv run python -m iclr_explorer.build_web_data</code> before starting the web app.</p>
        </section>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="loading-shell">
        <section className="loading-card">
          <p className="eyebrow">Loading conference data</p>
          <h1>ICLR 2026 Explorer</h1>
          <p>Preparing {bookmarkStorageKey()} and the local paper wallplanner.</p>
        </section>
      </main>
    );
  }

  return <ExplorerApp data={data} />;
}

export function ExplorerApp({ data }: { data: PapersPayload }) {
  const [view, setView] = useState<AppView>("explore");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(() => readSelectedPaperId());
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => loadBookmarks());

  const deferredQuery = useDeferredValue(filters.query);

  useEffect(() => {
    saveBookmarks(bookmarks);
  }, [bookmarks]);

  const syncSelectedPaperInUrl = useEffectEvent((paperId: string | null) => {
    const url = new URL(window.location.href);
    if (paperId) {
      url.searchParams.set("paper", paperId);
    } else {
      url.searchParams.delete("paper");
    }
    window.history.replaceState({}, "", url);
  });

  const handlePopState = useEffectEvent(() => {
    setSelectedPaperId(readSelectedPaperId());
  });

  useEffect(() => {
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [handlePopState]);

  useEffect(() => {
    syncSelectedPaperInUrl(selectedPaperId);
  }, [selectedPaperId, syncSelectedPaperInUrl]);

  useEffect(() => {
    if (selectedPaperId && !data.papers.some((paper) => paper.paper_id === selectedPaperId)) {
      setSelectedPaperId(null);
    }
  }, [data.papers, selectedPaperId]);

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

  function exportBookmarksCsv() {
    const content = buildCsv(data.columns, bookmarkedPapers);
    downloadTextFile("iclr-2026-bookmarks.csv", content, "text/csv;charset=utf-8");
  }

  function exportBookmarksIcs() {
    const { content } = buildIcs(bookmarkedPapers);
    downloadTextFile("iclr-2026-bookmarks.ics", content, "text/calendar;charset=utf-8");
  }

  const { skippedCount } = buildIcs(bookmarkedPapers);

  return (
    <main className="app-shell">
      <div className="backdrop-grid" />
      <header className="masthead">
        <div className="masthead-copy">
          <p className="eyebrow">ICLR 2026 field planner</p>
          <h1>Navigate the conference like a wall of annotated session cards.</h1>
          <p className="masthead-text">
            Search 5,472 papers, pin the ones that matter, and turn them into a day-by-day agenda
            without wrestling with the official site.
          </p>
        </div>
        <dl className="stat-board">
          <div>
            <dt>Papers</dt>
            <dd>{data.total_papers.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Scheduled</dt>
            <dd>{(data.total_papers - data.unresolved_schedule_count).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Bookmarks</dt>
            <dd>{bookmarks.size.toLocaleString()}</dd>
          </div>
        </dl>
      </header>

      <section className="toolbar">
        <div className="toolbar-tabs" role="tablist" aria-label="Primary views">
          <button
            className={view === "explore" ? "tab is-active" : "tab"}
            onClick={() => setView("explore")}
            role="tab"
            aria-selected={view === "explore"}
          >
            Explore
          </button>
          <button
            className={view === "agenda" ? "tab is-active" : "tab"}
            onClick={() => setView("agenda")}
            role="tab"
            aria-selected={view === "agenda"}
          >
            Agenda
          </button>
        </div>

        <div className="toolbar-meta">
          <span>{data.unresolved_schedule_count} papers still lack schedule metadata.</span>
          <span>Generated {data.generated_at || "locally"}.</span>
        </div>
      </section>

      {view === "explore" ? (
        <section className="explore-layout">
          <aside className="filters-card">
            <div className="filters-header">
              <h2>Filters</h2>
              <button className="ghost-button" onClick={() => setFilters(DEFAULT_FILTERS)}>
                Clear all
              </button>
            </div>

            <label className="field">
              <span>Search title, abstract, authors, topics</span>
              <input
                type="search"
                value={filters.query}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    query: event.target.value,
                  }))
                }
                placeholder="reasoning, multimodal, safety, meta-learning..."
              />
            </label>

            <div className="filter-row">
              <label className="field">
                <span>Date</span>
                <select
                  value={filters.selectedDate}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      selectedDate: event.target.value,
                    }))
                  }
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
                <span>Session type</span>
                <select
                  value={filters.selectedSessionType}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      selectedSessionType: event.target.value,
                    }))
                  }
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
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      bookmarkedOnly: event.target.checked,
                    }))
                  }
                />
                <span>Bookmarked only</span>
              </label>

              <label className="toggle">
                <input
                  type="checkbox"
                  checked={filters.scheduledOnly}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      scheduledOnly: event.target.checked,
                    }))
                  }
                />
                <span>Scheduled only</span>
              </label>
            </div>

            <div className="topic-panel">
              <div className="filters-header">
                <h3>Topic tags</h3>
                <span>{filters.selectedTopics.length} selected</span>
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

          <section className="results-column">
            <div className="results-toolbar">
              <div>
                <p className="eyebrow">Explore</p>
                <h2>{filteredPapers.length.toLocaleString()} papers match your current lens.</h2>
              </div>
              <div className="bulk-actions">
                <button className="action-button" onClick={bookmarkVisibleResults}>
                  Bookmark visible ({filteredPapers.length})
                </button>
                <button className="ghost-button" onClick={clearVisibleBookmarks}>
                  Clear visible ({bookmarkedVisibleCount})
                </button>
              </div>
            </div>

            <div className="paper-list" role="list">
              {filteredPapers.map((paper) => {
                const isSelected = selectedPaperId === paper.paper_id;
                const isBookmarked = bookmarks.has(paper.paper_id);
                return (
                  <article
                    key={paper.paper_id}
                    className={isSelected ? "paper-card is-selected" : "paper-card"}
                    onClick={() => setSelectedPaperId(paper.paper_id)}
                    role="listitem"
                  >
                    <div className="paper-card-topline">
                      <span className="paper-badge">{paper.session_type || "Paper"}</span>
                      <button
                        className={isBookmarked ? "bookmark-button is-on" : "bookmark-button"}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleBookmark(paper.paper_id);
                        }}
                        aria-label={`Bookmark ${paper.title}`}
                        aria-pressed={isBookmarked}
                        type="button"
                      >
                        {isBookmarked ? "Saved" : "Save"}
                      </button>
                    </div>
                    <h3>{paper.title}</h3>
                    <p className="paper-authors">{paper.authors || "Authors unavailable"}</p>
                    <p className="paper-schedule">{formatScheduleLabel(paper)}</p>
                    <div className="paper-tags">
                      {paper.topic_tags.slice(0, 2).map((topic) => (
                        <span key={topic} className="tag">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="detail-panel">
            {selectedPaper ? (
              <>
                <p className="eyebrow">Selected paper</p>
                <h2>{selectedPaper.title}</h2>
                <p className="detail-authors">{selectedPaper.authors || "Authors unavailable"}</p>
                <p className="detail-schedule">{formatScheduleLabel(selectedPaper)}</p>

                <div className="detail-links">
                  <ExternalLink href={selectedPaper.paper_url} label="Paper page" />
                  <ExternalLink href={selectedPaper.project_page} label="Project" />
                  <ExternalLink href={selectedPaper.pdf_url} label="PDF" />
                  <ExternalLink href={selectedPaper.video_url} label="Video" />
                  <ExternalLink href={selectedPaper.poster_url} label="Poster" />
                  <ExternalLink href={selectedPaper.code_url} label="Code" />
                </div>

                <div className="detail-topics">
                  {selectedPaper.topic_parts.map((topic) => (
                    <div key={topic.raw} className="topic-block">
                      <span>{topic.group || "Topic"}</span>
                      <strong>{topic.name}</strong>
                    </div>
                  ))}
                </div>

                <section className="detail-abstract">
                  <h3>Abstract</h3>
                  <p>{selectedPaper.abstract || "Abstract unavailable."}</p>
                </section>
              </>
            ) : (
              <div className="detail-empty">
                <p className="eyebrow">Detail pane</p>
                <h2>Pick a paper to inspect the schedule and links.</h2>
                <p>
                  Shared links restore this panel via <code>?paper=...</code>. Filters and bookmarks
                  stay local.
                </p>
              </div>
            )}
          </aside>
        </section>
      ) : (
        <section className="agenda-layout">
          <div className="agenda-toolbar">
            <div>
              <p className="eyebrow">Agenda</p>
              <h2>{bookmarkedPapers.length.toLocaleString()} bookmarked papers in your local plan.</h2>
            </div>
            <div className="bulk-actions">
              <button
                className="action-button"
                onClick={exportBookmarksCsv}
                disabled={bookmarkedPapers.length === 0}
              >
                Export CSV
              </button>
              <button
                className="action-button"
                onClick={exportBookmarksIcs}
                disabled={bookmarkedPapers.length === 0}
              >
                Export ICS
              </button>
            </div>
          </div>

          <p className="agenda-note">
            {skippedCount > 0
              ? `${skippedCount} bookmarked papers were skipped from ICS because their schedule is still unresolved.`
              : "All bookmarked papers have enough schedule metadata for ICS export."}
          </p>

          {agenda.scheduledGroups.map((group) => (
            <section key={group.date} className="agenda-day">
              <header className="agenda-day-header">
                <p className="eyebrow">Conference day</p>
                <h3>{group.label}</h3>
              </header>
              <div className="agenda-grid">
                {group.papers.map((paper) => (
                  <article key={paper.paper_id} className="agenda-card">
                    <div className="agenda-card-topline">
                      <span className="paper-badge">{paper.session_type || "Paper"}</span>
                      <span>
                        {paper.session_start || "TBD"}
                        {paper.session_end ? `-${paper.session_end}` : ""}
                      </span>
                    </div>
                    <h4>{paper.title}</h4>
                    <p>{paper.authors || "Authors unavailable"}</p>
                    <p>{paper.room || "Room pending"}</p>
                    <div className="detail-links">
                      <button className="ghost-button" onClick={() => setSelectedPaperId(paper.paper_id)}>
                        Open details
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}

          {agenda.unscheduled.length > 0 ? (
            <section className="agenda-day">
              <header className="agenda-day-header">
                <p className="eyebrow">Needs manual follow-up</p>
                <h3>Unscheduled bookmarks</h3>
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
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </section>
      )}
    </main>
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

function readSelectedPaperId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get("paper");
}
