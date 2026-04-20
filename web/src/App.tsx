import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  startTransition,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { List, useDynamicRowHeight, type RowComponentProps } from "react-window";

import { buildCsv, buildIcs, buildWorkshopIcs, downloadTextFile } from "./lib/export";
import {
  filterPapers,
  filterWorkshops,
  formatDateLabel,
  formatScheduleLabel,
  formatWorkshopScheduleLabel,
  groupAgenda,
} from "./lib/filters";
import {
  bookmarkStorageKey,
  loadBookmarks,
  loadWorkshopBookmarks,
  saveBookmarks,
  saveWorkshopBookmarks,
} from "./lib/storage";
import { formatPaperAbstract, formatPaperTitle } from "./lib/title";
import type {
  Filters,
  Paper,
  PapersPayload,
  Workshop,
  WorkshopFilters,
  WorkshopsPayload,
} from "./types";

const DEFAULT_FILTERS: Filters = {
  query: "",
  selectedTopics: [],
  selectedDate: "",
  selectedSessionType: "",
  bookmarkedOnly: false,
  scheduledOnly: false,
};

const DEFAULT_WORKSHOP_FILTERS: WorkshopFilters = {
  query: "",
  selectedDate: "",
  selectedRoom: "",
  savedOnly: false,
  scheduledOnly: false,
};

const DATA_URL = `${import.meta.env.BASE_URL}data/papers.json`;
const WORKSHOPS_DATA_URL = `${import.meta.env.BASE_URL}data/workshops.json`;
const ICLR_LOGO_URL = "https://iclr.cc/static/core/img/iclr-navbar-logo.svg";
const MOBILE_QUERY = "(max-width: 960px)";
const SEARCH_COMMIT_DELAY_MS = 1500;

type AppView = "explore" | "agenda";
type ContentView = "papers" | "workshops";

interface ExplorerUrlState {
  content: ContentView;
  view: AppView;
  paper: string | null;
  workshop: string | null;
  filters: Filters;
  workshopFilters: WorkshopFilters;
}

interface PaperListRowData {
  bookmarks: Set<string>;
  onOpen: (paperId: string) => void;
  onToggleBookmark: (paperId: string) => void;
  papers: Paper[];
  selectedPaperId: string | null;
}

interface WorkshopListRowData {
  bookmarks: Set<string>;
  onOpen: (workshopId: string) => void;
  onToggleBookmark: (workshopId: string) => void;
  selectedWorkshopId: string | null;
  workshops: Workshop[];
}

const EMPTY_WORKSHOPS_PAYLOAD: WorkshopsPayload = {
  generated_at: "",
  source_csv: "data/iclr2026/workshops.csv",
  columns: [],
  total_workshops: 0,
  session_dates: [],
  rooms: [],
  unresolved_schedule_count: 0,
  workshops: [],
};

export function App() {
  const [data, setData] = useState<PapersPayload | null>(null);
  const [workshopsData, setWorkshopsData] = useState<WorkshopsPayload>(EMPTY_WORKSHOPS_PAYLOAD);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const papersResponse = await fetch(DATA_URL);

        if (!papersResponse.ok) {
          throw new Error(`Failed to load papers.json (${papersResponse.status})`);
        }

        const papersPayload = (await papersResponse.json()) as PapersPayload;
        let nextWorkshopsPayload = EMPTY_WORKSHOPS_PAYLOAD;
        try {
          const workshopsResponse = await fetch(WORKSHOPS_DATA_URL);
          if (workshopsResponse.ok) {
            nextWorkshopsPayload = (await workshopsResponse.json()) as WorkshopsPayload;
          }
        } catch (workshopsLoadError) {
          console.warn("Failed to load workshops data; continuing with papers-only mode.", workshopsLoadError);
          nextWorkshopsPayload = EMPTY_WORKSHOPS_PAYLOAD;
        }
        if (!cancelled) {
          setData(papersPayload);
          setWorkshopsData(nextWorkshopsPayload);
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
            Run <code>uv run python -m iclr_explorer.build_web_data</code> and{" "}
            <code>uv run python -m iclr_explorer.build_workshop_web_data</code> before starting
            the web app.
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

  return <ExplorerApp data={data} workshopsData={workshopsData} />;
}

export function ExplorerApp({
  data,
  workshopsData = EMPTY_WORKSHOPS_PAYLOAD,
}: {
  data: PapersPayload;
  workshopsData?: WorkshopsPayload;
}) {
  const hasWorkshops = workshopsData.total_workshops > 0;
  const initialUrlStateRef = useRef<ExplorerUrlState | null>(null);
  if (!initialUrlStateRef.current) {
    initialUrlStateRef.current = readExplorerUrlState();
  }

  const initialUrlState = initialUrlStateRef.current;
  const [contentView, setContentView] = useState<ContentView>(
    initialUrlState.content === "workshops" && hasWorkshops ? "workshops" : "papers",
  );
  const [view, setView] = useState<AppView>(initialUrlState.view);
  const [filters, setFilters] = useState<Filters>(initialUrlState.filters);
  const [workshopFilters, setWorkshopFilters] = useState<WorkshopFilters>(initialUrlState.workshopFilters);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(initialUrlState.paper);
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string | null>(
    initialUrlState.content === "workshops" ? initialUrlState.workshop : null,
  );
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => loadBookmarks());
  const [workshopBookmarks, setWorkshopBookmarks] = useState<Set<string>>(() => loadWorkshopBookmarks());
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(
    () => Boolean(initialUrlState.paper || (initialUrlState.content === "workshops" && initialUrlState.workshop)),
  );
  const [searchDraft, setSearchDraft] = useState(initialUrlState.filters.query);
  const [workshopSearchDraft, setWorkshopSearchDraft] = useState(initialUrlState.workshopFilters.query);
  const [topicQuery, setTopicQuery] = useState("");
  const isMobile = useMediaQuery(MOBILE_QUERY);
  const viewportHeight = useViewportHeight();

  useEffect(() => {
    saveBookmarks(bookmarks);
  }, [bookmarks]);

  useEffect(() => {
    saveWorkshopBookmarks(workshopBookmarks);
  }, [workshopBookmarks]);

  const restoreUrlState = useEffectEvent(() => {
    const nextState = readExplorerUrlState();
    setContentView(nextState.content === "workshops" && hasWorkshops ? "workshops" : "papers");
    setView(nextState.view);
    setFilters(nextState.filters);
    setWorkshopFilters(nextState.workshopFilters);
    setSelectedPaperId(nextState.paper);
    setSelectedWorkshopId(nextState.content === "workshops" ? nextState.workshop : null);
    setIsDetailOpen(Boolean(nextState.paper || nextState.workshop));
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
      content: contentView,
      view,
      paper: selectedPaperId,
      workshop: selectedWorkshopId,
      filters,
      workshopFilters,
    });
  }, [contentView, filters, selectedPaperId, selectedWorkshopId, view, workshopFilters]);

  useEffect(() => {
    setSearchDraft(filters.query);
  }, [filters.query]);

  useEffect(() => {
    setWorkshopSearchDraft(workshopFilters.query);
  }, [workshopFilters.query]);

  useEffect(() => {
    if (searchDraft === filters.query) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      commitSearchQuery(searchDraft);
    }, SEARCH_COMMIT_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [filters.query, searchDraft]);

  useEffect(() => {
    if (workshopSearchDraft === workshopFilters.query) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      updateWorkshopFilters({ query: workshopSearchDraft });
    }, SEARCH_COMMIT_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [workshopFilters.query, workshopSearchDraft]);

  useEffect(() => {
    if (!isMobile) {
      setIsMobileFiltersOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (contentView !== "papers" || view !== "explore") {
      setIsMobileFiltersOpen(false);
    }
  }, [contentView, view]);

  useEffect(() => {
    if (!hasWorkshops && contentView === "workshops") {
      setContentView("papers");
      setSelectedWorkshopId(null);
      setIsDetailOpen(false);
    }
  }, [contentView, hasWorkshops]);

  useEffect(() => {
    if (!isDetailOpen) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isDetailOpen]);

  useEffect(() => {
    if (!isDetailOpen) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsDetailOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isDetailOpen]);

  const filteredPapers = useMemo(
    () => filterPapers(data.papers, filters, bookmarks),
    [bookmarks, data.papers, filters],
  );
  const filteredWorkshops = useMemo(
    () => filterWorkshops(workshopsData.workshops, workshopFilters, workshopBookmarks),
    [workshopBookmarks, workshopFilters, workshopsData.workshops],
  );

  const bookmarkedPapers = useMemo(
    () => data.papers.filter((paper) => bookmarks.has(paper.paper_id)),
    [bookmarks, data.papers],
  );

  const selectedPaper = useMemo(
    () => data.papers.find((paper) => paper.paper_id === selectedPaperId) ?? null,
    [data.papers, selectedPaperId],
  );
  const selectedWorkshop = useMemo(
    () => workshopsData.workshops.find((workshop) => workshop.workshop_id === selectedWorkshopId) ?? null,
    [selectedWorkshopId, workshopsData.workshops],
  );

  const agenda = useMemo(() => groupAgenda(bookmarkedPapers), [bookmarkedPapers]);
  const bookmarkedWorkshops = useMemo(
    () => workshopsData.workshops.filter((workshop) => workshopBookmarks.has(workshop.workshop_id)),
    [workshopBookmarks, workshopsData.workshops],
  );

  const bookmarkedVisibleCount = useMemo(
    () => filteredPapers.filter((paper) => bookmarks.has(paper.paper_id)).length,
    [bookmarks, filteredPapers],
  );
  const bookmarkedVisibleWorkshopCount = useMemo(
    () => filteredWorkshops.filter((workshop) => workshopBookmarks.has(workshop.workshop_id)).length,
    [filteredWorkshops, workshopBookmarks],
  );

  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);
  const activeWorkshopFilterCount = useMemo(
    () => countActiveWorkshopFilters(workshopFilters),
    [workshopFilters],
  );
  const generatedLabel = useMemo(
    () => formatGeneratedLabel(contentView === "workshops" ? workshopsData.generated_at : data.generated_at),
    [contentView, data.generated_at, workshopsData.generated_at],
  );
  const skippedAgendaCount = useMemo(() => buildIcs(bookmarkedPapers).skippedCount, [bookmarkedPapers]);
  const visibleTopicTags = useMemo(() => {
    const query = topicQuery.trim().toLowerCase();
    if (!query) {
      return data.topic_tags;
    }
    return data.topic_tags.filter((topic) => formatTopicLabel(topic).toLowerCase().includes(query));
  }, [data.topic_tags, topicQuery]);
  const resultsListHeight = useMemo(
    () =>
      Math.max(
        isMobile ? 460 : 620,
        Math.min(Math.round(viewportHeight * (isMobile ? 0.72 : 0.8)), isMobile ? 860 : 1400),
      ),
    [isMobile, viewportHeight],
  );
  const paperRowHeights = useDynamicRowHeight({
    defaultRowHeight: isMobile ? 286 : 238,
    key: `papers-${isMobile ? "mobile" : "desktop"}`,
  });
  const workshopRowHeights = useDynamicRowHeight({
    defaultRowHeight: isMobile ? 328 : 276,
    key: `workshops-${isMobile ? "mobile" : "desktop"}`,
  });
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
  const workshopListRowData = useMemo<WorkshopListRowData>(
    () => ({
      bookmarks: workshopBookmarks,
      onOpen: openWorkshop,
      onToggleBookmark: toggleWorkshopBookmark,
      selectedWorkshopId,
      workshops: filteredWorkshops,
    }),
    [filteredWorkshops, selectedWorkshopId, workshopBookmarks],
  );

  useEffect(() => {
    if (selectedPaperId && !data.papers.some((paper) => paper.paper_id === selectedPaperId)) {
      setSelectedPaperId(null);
      if (contentView === "papers") {
        setIsDetailOpen(false);
      }
    }
  }, [contentView, data.papers, selectedPaperId]);

  useEffect(() => {
    if (
      selectedWorkshopId &&
      !workshopsData.workshops.some((workshop) => workshop.workshop_id === selectedWorkshopId)
    ) {
      setSelectedWorkshopId(null);
      if (contentView === "workshops") {
        setIsDetailOpen(false);
      }
    }
  }, [contentView, selectedWorkshopId, workshopsData.workshops]);

  useEffect(() => {
    if (contentView !== "papers" || view !== "explore") {
      return;
    }

    if (filteredPapers.length === 0) {
      setSelectedPaperId(null);
      setIsDetailOpen(false);
      return;
    }

    if (!selectedPaperId) {
      setIsDetailOpen(false);
      return;
    }

    const selectedStillVisible = filteredPapers.some((paper) => paper.paper_id === selectedPaperId);
    if (selectedStillVisible) {
      return;
    }

    setSelectedPaperId(null);
    setIsDetailOpen(false);
  }, [contentView, filteredPapers, selectedPaperId, view]);

  useEffect(() => {
    if (contentView !== "workshops") {
      return;
    }

    if (filteredWorkshops.length === 0) {
      setSelectedWorkshopId(null);
      setIsDetailOpen(false);
      return;
    }

    if (!selectedWorkshopId) {
      setIsDetailOpen(false);
      return;
    }

    const selectedStillVisible = filteredWorkshops.some(
      (workshop) => workshop.workshop_id === selectedWorkshopId,
    );
    if (selectedStillVisible) {
      return;
    }

    setSelectedWorkshopId(null);
    setIsDetailOpen(false);
  }, [contentView, filteredWorkshops, selectedWorkshopId]);

  function updateFilters(nextValue: Partial<Filters>) {
    startTransition(() => {
      setFilters((current) => ({
        ...current,
        ...nextValue,
      }));
    });
  }

  function commitSearchQuery(nextQuery: string) {
    updateFilters({ query: nextQuery });
  }

  function updateWorkshopFilters(nextValue: Partial<WorkshopFilters>) {
    startTransition(() => {
      setWorkshopFilters((current) => ({
        ...current,
        ...nextValue,
      }));
    });
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    if (contentView === "workshops") {
      updateWorkshopFilters({ query: workshopSearchDraft });
      return;
    }
    commitSearchQuery(searchDraft);
  }

  function handleViewChange(nextView: AppView) {
    setView(nextView);
    setIsDetailOpen(false);
    if (nextView !== "explore") {
      setIsMobileFiltersOpen(false);
    }
  }

  function handleContentChange(nextContent: ContentView) {
    if (nextContent === "workshops" && !hasWorkshops) {
      return;
    }
    setContentView(nextContent);
    setIsDetailOpen(false);
    setIsMobileFiltersOpen(false);
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

  function toggleWorkshopBookmark(workshopId: string) {
    startTransition(() => {
      setWorkshopBookmarks((current) => {
        const next = new Set(current);
        if (next.has(workshopId)) {
          next.delete(workshopId);
        } else {
          next.add(workshopId);
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

  function bookmarkVisibleWorkshops() {
    startTransition(() => {
      setWorkshopBookmarks((current) => {
        const next = new Set(current);
        for (const workshop of filteredWorkshops) {
          next.add(workshop.workshop_id);
        }
        return next;
      });
    });
  }

  function clearVisibleWorkshopBookmarks() {
    startTransition(() => {
      setWorkshopBookmarks((current) => {
        const next = new Set(current);
        for (const workshop of filteredWorkshops) {
          next.delete(workshop.workshop_id);
        }
        return next;
      });
    });
  }

  function openPaper(paperId: string) {
    setSelectedPaperId(paperId);
    setSelectedWorkshopId(null);
    setIsDetailOpen(true);
  }

  function openWorkshop(workshopId: string) {
    setSelectedWorkshopId(workshopId);
    setSelectedPaperId(null);
    setIsDetailOpen(true);
  }

  function resetFilters() {
    setSearchDraft(DEFAULT_FILTERS.query);
    setFilters(DEFAULT_FILTERS);
  }

  function resetWorkshopFilters() {
    setWorkshopSearchDraft(DEFAULT_WORKSHOP_FILTERS.query);
    setWorkshopFilters(DEFAULT_WORKSHOP_FILTERS);
  }

  function exportBookmarksCsv() {
    const content = buildCsv(data.columns, bookmarkedPapers);
    downloadTextFile("iclr-2026-bookmarks.csv", content, "text/csv;charset=utf-8");
  }

  function exportBookmarksIcs() {
    const { content } = buildIcs(bookmarkedPapers);
    downloadTextFile("iclr-2026-bookmarks.ics", content, "text/calendar;charset=utf-8");
  }

  function exportWorkshopBookmarksCsv() {
    const content = buildCsv(workshopsData.columns, bookmarkedWorkshops);
    downloadTextFile("iclr-2026-workshops-bookmarks.csv", content, "text/csv;charset=utf-8");
  }

  function exportWorkshopBookmarksIcs() {
    const { content } = buildWorkshopIcs(bookmarkedWorkshops);
    downloadTextFile("iclr-2026-workshops-bookmarks.ics", content, "text/calendar;charset=utf-8");
  }

  const headerContextLabel =
    contentView === "workshops"
      ? `${filteredWorkshops.length.toLocaleString()} workshops in the current lens`
      : view === "explore"
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
            <div className="brand-lockup">
              <img
                className="iclr-logo"
                src={ICLR_LOGO_URL}
                alt="ICLR - International Conference on Learning Representations"
              />
              <div className="brand-title">
                <p className="eyebrow">Conference Program Explorer</p>
                <h1>ICLR 2026 Conference Explorer</h1>
                <p className="command-copy">
                  {contentView === "workshops"
                    ? "Review workshop events in a dedicated lane with their own filters, detail pages, and schedule metadata."
                    : "Search the full ICLR 2026 paper program, pin the papers that matter, and build a clean local agenda without wrestling with the conference site."}
                </p>
              </div>
            </div>
          </div>

          <dl className="stat-strip">
            <div className="stat-pill">
              <dt>{contentView === "workshops" ? "Workshops" : "Papers"}</dt>
              <dd>
                {contentView === "workshops"
                  ? workshopsData.total_workshops.toLocaleString()
                  : data.total_papers.toLocaleString()}
              </dd>
            </div>
            <div className="stat-pill">
              <dt>Scheduled</dt>
              <dd>
                {contentView === "workshops"
                  ? (workshopsData.total_workshops - workshopsData.unresolved_schedule_count).toLocaleString()
                  : (data.total_papers - data.unresolved_schedule_count).toLocaleString()}
              </dd>
            </div>
            <div className="stat-pill">
              <dt>Saved</dt>
              <dd>
                {contentView === "workshops"
                  ? workshopBookmarks.size.toLocaleString()
                  : bookmarks.size.toLocaleString()}
              </dd>
            </div>
          </dl>
        </div>

        <div className="command-bar">
          <div className="toolbar-tabs" role="tablist" aria-label="Program content">
            <button
              className={contentView === "papers" ? "tab is-active" : "tab"}
              onClick={() => handleContentChange("papers")}
              role="tab"
              aria-selected={contentView === "papers"}
              type="button"
            >
              Papers
            </button>
            {hasWorkshops ? (
              <button
                className={contentView === "workshops" ? "tab is-active" : "tab"}
                onClick={() => handleContentChange("workshops")}
                role="tab"
                aria-selected={contentView === "workshops"}
                type="button"
              >
                Workshops
              </button>
            ) : null}
          </div>

          {contentView === "papers" ? (
            <div className="toolbar-tabs" role="tablist" aria-label="Paper views">
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
          ) : null}

          <label className="search-shell">
            <span className="search-label">Primary Search</span>
            <input
              className="search-input"
              type="search"
              aria-label={contentView === "workshops" ? "Search workshops" : "Search papers"}
              name="q"
              autoComplete="off"
              value={contentView === "workshops" ? workshopSearchDraft : searchDraft}
              onChange={(event) =>
                contentView === "workshops"
                  ? setWorkshopSearchDraft(event.target.value)
                  : setSearchDraft(event.target.value)
              }
              onKeyDown={handleSearchKeyDown}
              placeholder={
                contentView === "workshops"
                  ? "Agents, reasoning, multimodal…"
                  : "Reasoning, multimodal, safety…"
              }
            />
          </label>

          {(contentView === "workshops" || view === "explore") && isMobile ? (
            <button
              className="ghost-button filter-disclosure"
              onClick={() => setIsMobileFiltersOpen((current) => !current)}
              type="button"
            >
              {isMobileFiltersOpen
                ? "Hide Filters"
                : `Filters${
                    (contentView === "workshops" ? activeWorkshopFilterCount : activeFilterCount) > 0
                      ? ` (${contentView === "workshops" ? activeWorkshopFilterCount : activeFilterCount})`
                      : ""
                  }`}
            </button>
          ) : (
            <div className="header-context-pill">{headerContextLabel}</div>
          )}
        </div>

        <div className="header-meta">
          <span>{headerContextLabel}</span>
          <span>
            {contentView === "workshops"
              ? `${workshopsData.unresolved_schedule_count.toLocaleString()} workshops still need schedule metadata.`
              : `${data.unresolved_schedule_count.toLocaleString()} papers still need schedule metadata.`}
          </span>
          {generatedLabel ? <span>Updated {generatedLabel}</span> : null}
        </div>
      </header>

      {contentView === "workshops" ? (
        <section className="explore-layout">
          {!isMobile || isMobileFiltersOpen ? (
            <aside className={isMobile ? "filters-card is-mobile-open" : "filters-card"}>
              <div className="filters-header">
                <div>
                  <p className="eyebrow">Refine</p>
                  <h2>Workshop Filters</h2>
                </div>
                <button className="ghost-button" onClick={resetWorkshopFilters} type="button">
                  Clear All
                </button>
              </div>

              <p className="filters-note">
                Keep workshop discovery separate from paper triage by filtering only event metadata.
              </p>

              <div className="filter-row">
                <label className="field">
                  <span>Date</span>
                  <select
                    name="workshopDate"
                    value={workshopFilters.selectedDate}
                    onChange={(event) => updateWorkshopFilters({ selectedDate: event.target.value })}
                  >
                    <option value="">All workshop days</option>
                    {workshopsData.session_dates.map((date) => (
                      <option key={date} value={date}>
                        {formatDateLabel(date)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Room</span>
                  <select
                    name="workshopRoom"
                    value={workshopFilters.selectedRoom}
                    onChange={(event) => updateWorkshopFilters({ selectedRoom: event.target.value })}
                  >
                    <option value="">All rooms</option>
                    {workshopsData.rooms.map((room) => (
                      <option key={room} value={room}>
                        {room}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="toggle-stack">
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={workshopFilters.savedOnly}
                    onChange={(event) => updateWorkshopFilters({ savedOnly: event.target.checked })}
                  />
                  <span>Saved workshops only</span>
                </label>

                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={workshopFilters.scheduledOnly}
                    onChange={(event) => updateWorkshopFilters({ scheduledOnly: event.target.checked })}
                  />
                  <span>Scheduled workshops only</span>
                </label>
              </div>
            </aside>
          ) : null}

          <section className="results-column" id="results-panel" aria-live="polite">
            <div className="results-toolbar">
              <div>
                <p className="eyebrow">Workshop Explorer</p>
                <h2>
                  {filteredWorkshops.length > 0
                    ? `${filteredWorkshops.length.toLocaleString()} workshops in view.`
                    : "No workshops match the current lens."}
                </h2>
              </div>
              <div className="bulk-actions">
                <button className="action-button" onClick={bookmarkVisibleWorkshops} type="button">
                  Save Visible ({filteredWorkshops.length.toLocaleString()})
                </button>
                <button
                  className="ghost-button"
                  onClick={clearVisibleWorkshopBookmarks}
                  type="button"
                >
                  Clear Visible ({bookmarkedVisibleWorkshopCount.toLocaleString()})
                </button>
                <button
                  className="ghost-button"
                  onClick={exportWorkshopBookmarksCsv}
                  disabled={bookmarkedWorkshops.length === 0}
                  type="button"
                >
                  Export CSV
                </button>
                <button
                  className="action-button"
                  onClick={exportWorkshopBookmarksIcs}
                  disabled={bookmarkedWorkshops.length === 0}
                  type="button"
                >
                  Export ICS
                </button>
              </div>
            </div>

            {filteredWorkshops.length > 0 ? (
              <List
                className="paper-vlist"
                rowComponent={WorkshopListRow}
                rowCount={filteredWorkshops.length}
                rowHeight={workshopRowHeights}
                rowProps={workshopListRowData}
                overscanCount={6}
                style={{ height: resultsListHeight, width: "100%" }}
              />
            ) : (
              <div className="empty-state">
                <p className="eyebrow">Nothing in View</p>
                <h3>Try a broader workshop filter combination.</h3>
                <p>
                  The current workshop query and filters remove every result. Clear the filters or
                  loosen the search terms.
                </p>
                <button className="action-button" onClick={resetWorkshopFilters} type="button">
                  Reset Filters
                </button>
              </div>
            )}
          </section>
        </section>
      ) : view === "explore" ? (
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
                Narrow the paper wall by day, format, saved status, and topic filters.
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
                  <h3>Topic Filters</h3>
                  <span>{filters.selectedTopics.length} active</span>
                </div>
                <label className="topic-search-field">
                  <span>Find topics</span>
                  <input
                    className="search-input"
                    type="search"
                    name="topicQuery"
                    autoComplete="off"
                    value={topicQuery}
                    onChange={(event) => setTopicQuery(event.target.value)}
                    placeholder="Search by area or keyword"
                  />
                </label>
                {filters.selectedTopics.length > 0 ? (
                  <div className="selected-topic-row">
                    {filters.selectedTopics.map((topic) => (
                      <button
                        key={topic}
                        className="topic-chip is-selected"
                        onClick={() => toggleTopic(topic)}
                        type="button"
                        aria-label={`Remove topic filter ${formatTopicLabel(topic)}`}
                      >
                        {formatTopicLabel(topic)} ×
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="topic-grid">
                  {visibleTopicTags.map((topic) => {
                    const selected = filters.selectedTopics.includes(topic);
                    return (
                      <button
                        key={topic}
                        className={selected ? "topic-chip is-selected" : "topic-chip"}
                        onClick={() => toggleTopic(topic)}
                        type="button"
                      >
                        {formatTopicLabel(topic)}
                      </button>
                    );
                  })}
                </div>
                {visibleTopicTags.length === 0 ? (
                  <p className="topic-empty">No topics match this search.</p>
                ) : null}
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
                rowHeight={paperRowHeights}
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
                        <h4>{formatPaperTitle(paper.title)}</h4>
                        <p>{paper.authors || "Authors unavailable"}</p>
                        <p>{paper.room || "Room pending"}</p>
                        <button
                          className="ghost-button"
                          onClick={() => openPaper(paper.paper_id)}
                          type="button"
                        >
                          View details
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
                        <h4>{formatPaperTitle(paper.title)}</h4>
                        <p>{paper.authors || "Authors unavailable"}</p>
                        <p>{paper.notes || "No schedule metadata yet."}</p>
                        <button
                          className="ghost-button"
                          onClick={() => openPaper(paper.paper_id)}
                          type="button"
                        >
                          View details
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

      <footer className="app-footer" aria-label="Project links">
        <div className="footer-brand">
          <p className="eyebrow">Project</p>
          <h2>ICLR 2026 Conference Explorer</h2>
          <p>
            An independent interface for browsing the ICLR 2026 program with separate lanes for
            paper exploration and workshop discovery.
          </p>
        </div>

        <div className="footer-actions">
          <a
            className="footer-link-card"
            href="https://github.com/naufalso/ICLR-2026-Explorer"
            target="_blank"
            rel="noreferrer"
          >
            <span>Source Code</span>
            <strong>View Repository</strong>
          </a>
          <a
            className="footer-link-card"
            href="https://github.com/naufalso"
            target="_blank"
            rel="noreferrer"
          >
            <span>Maintainer</span>
            <strong>@naufalso</strong>
          </a>
        </div>
      </footer>

      {(selectedPaper || selectedWorkshop) && isDetailOpen ? (
        <div
          className="detail-modal-backdrop"
          onClick={() => setIsDetailOpen(false)}
          role="presentation"
        >
          <aside
            className="detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              selectedWorkshop
                ? formatPaperTitle(selectedWorkshop.title)
                : selectedPaper
                  ? formatPaperTitle(selectedPaper.title)
                  : "Selected detail"
            }
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="ghost-button close-button"
              onClick={() => setIsDetailOpen(false)}
              type="button"
            >
              Close
            </button>
            {selectedWorkshop ? <WorkshopDetail workshop={selectedWorkshop} /> : null}
            {!selectedWorkshop && selectedPaper ? <PaperDetail paper={selectedPaper} /> : null}
          </aside>
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
          aria-label={`${isBookmarked ? "Remove bookmark for" : "Save bookmark for"} ${formatPaperTitle(paper.title)}`}
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
        <span className="paper-card-title">{formatPaperTitle(paper.title)}</span>
        <span className="paper-authors">{paper.authors || "Authors unavailable"}</span>
        <span className="paper-schedule">{formatScheduleLabel(paper)}</span>
        {paper.topic_tags.length > 0 ? (
          <span className="paper-tags">
            {paper.topic_tags.slice(0, 3).map((topic) => (
              <span key={topic} className="tag">
                {formatTopicLabel(topic)}
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
        height: "auto",
        paddingBottom: 14,
        width: "100%",
      }}
    >
      <PaperCard
        paper={paper}
        isBookmarked={bookmarks.has(paper.paper_id)}
        isSelected={selectedPaperId === paper.paper_id}
        onOpen={() => onOpen(paper.paper_id)}
        onToggleBookmark={() => onToggleBookmark(paper.paper_id)}
      />
    </div>
  );
}

function WorkshopCard({
  isBookmarked,
  workshop,
  isSelected,
  onOpen,
  onToggleBookmark,
  style,
}: {
  isBookmarked: boolean;
  workshop: Workshop;
  isSelected: boolean;
  onOpen: () => void;
  onToggleBookmark: () => void;
  style?: CSSProperties;
}) {
  return (
    <article className={isSelected ? "paper-card is-selected" : "paper-card"} style={style}>
      <div className="paper-card-topline">
        <span className="paper-badge">{workshop.event_type || "Workshop"}</span>
        <button
          className={isBookmarked ? "bookmark-button is-on" : "bookmark-button"}
          onClick={onToggleBookmark}
          aria-label={`${isBookmarked ? "Remove saved workshop" : "Save workshop"} ${formatPaperTitle(workshop.title)}`}
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
        <span className="paper-card-title">{formatPaperTitle(workshop.title)}</span>
        <span className="paper-authors">{workshop.organizers || "Organizers unavailable"}</span>
        <span className="paper-schedule">{formatWorkshopScheduleLabel(workshop)}</span>
        <span className="paper-summary">{formatPaperAbstract(workshop.summary || "Summary unavailable.")}</span>
      </button>
    </article>
  );
}

function WorkshopListRow({
  ariaAttributes,
  bookmarks,
  index,
  onOpen,
  onToggleBookmark,
  selectedWorkshopId,
  style,
  workshops,
}: RowComponentProps<WorkshopListRowData>) {
  const workshop = workshops[index];
  if (!workshop) {
    return null;
  }

  return (
    <div
      {...ariaAttributes}
      style={{
        ...style,
        height: "auto",
        paddingBottom: 14,
        width: "100%",
      }}
    >
      <WorkshopCard
        isBookmarked={bookmarks.has(workshop.workshop_id)}
        workshop={workshop}
        isSelected={selectedWorkshopId === workshop.workshop_id}
        onOpen={() => onOpen(workshop.workshop_id)}
        onToggleBookmark={() => onToggleBookmark(workshop.workshop_id)}
      />
    </div>
  );
}

function PaperDetail({ paper }: { paper: Paper }) {
  return (
    <div className="paper-detail">
      <p className="eyebrow">Selected Paper</p>
      <h2>{formatPaperTitle(paper.title)}</h2>
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
        <p>{paper.abstract ? formatPaperAbstract(paper.abstract) : "Abstract unavailable."}</p>
      </section>
    </div>
  );
}

function WorkshopDetail({ workshop }: { workshop: Workshop }) {
  return (
    <div className="paper-detail">
      <p className="eyebrow">Selected Workshop</p>
      <h2>{formatPaperTitle(workshop.title)}</h2>
      <p className="detail-authors">{workshop.organizers || "Organizers unavailable"}</p>
      <p className="detail-schedule">{formatWorkshopScheduleLabel(workshop)}</p>

      <div className="detail-links">
        <ExternalLink href={workshop.workshop_url} label="Workshop page" />
        <ExternalLink href={workshop.project_page} label="Project" />
      </div>

      <section className="detail-abstract">
        <h3>Summary</h3>
        <p>{workshop.summary ? formatPaperAbstract(workshop.summary) : "Summary unavailable."}</p>
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

function countActiveWorkshopFilters(filters: WorkshopFilters): number {
  return [
    filters.selectedDate,
    filters.selectedRoom,
    filters.savedOnly ? "saved" : "",
    filters.scheduledOnly ? "scheduled" : "",
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

function formatTopicLabel(topic: string): string {
  return topic.replaceAll("->", " › ");
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
      content: "papers",
      view: "explore",
      paper: null,
      workshop: null,
      filters: DEFAULT_FILTERS,
      workshopFilters: DEFAULT_WORKSHOP_FILTERS,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const topicValue = params.get("topics") ?? "";

  return {
    content: params.get("content") === "workshops" ? "workshops" : "papers",
    view: params.get("view") === "agenda" ? "agenda" : "explore",
    paper: params.get("paper"),
    workshop: params.get("workshop"),
    filters: {
      query: params.get("q") ?? "",
      selectedTopics: topicValue ? topicValue.split(",").filter(Boolean) : [],
      selectedDate: params.get("date") ?? "",
      selectedSessionType: params.get("sessionType") ?? "",
      bookmarkedOnly: params.get("bookmarked") === "1",
      scheduledOnly: params.get("scheduled") === "1",
    },
    workshopFilters: {
      query: params.get("wq") ?? "",
      selectedDate: params.get("wdate") ?? "",
      selectedRoom: params.get("wroom") ?? "",
      savedOnly: params.get("wsaved") === "1",
      scheduledOnly: params.get("wscheduled") === "1",
    },
  };
}

function writeExplorerUrlState(state: ExplorerUrlState): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  setUrlParam(url.searchParams, "content", state.content === "workshops" ? "workshops" : "");
  setUrlParam(url.searchParams, "view", state.view === "agenda" ? "agenda" : "");
  setUrlParam(url.searchParams, "paper", state.content === "papers" ? state.paper : "");
  setUrlParam(url.searchParams, "workshop", state.content === "workshops" ? state.workshop : "");
  setUrlParam(url.searchParams, "q", state.filters.query);
  setUrlParam(url.searchParams, "date", state.filters.selectedDate);
  setUrlParam(url.searchParams, "sessionType", state.filters.selectedSessionType);
  setUrlParam(url.searchParams, "topics", state.filters.selectedTopics.join(","));
  setUrlParam(url.searchParams, "bookmarked", state.filters.bookmarkedOnly ? "1" : "");
  setUrlParam(url.searchParams, "scheduled", state.filters.scheduledOnly ? "1" : "");
  setUrlParam(url.searchParams, "wq", state.workshopFilters.query);
  setUrlParam(url.searchParams, "wdate", state.workshopFilters.selectedDate);
  setUrlParam(url.searchParams, "wroom", state.workshopFilters.selectedRoom);
  setUrlParam(url.searchParams, "wsaved", state.workshopFilters.savedOnly ? "1" : "");
  setUrlParam(url.searchParams, "wscheduled", state.workshopFilters.scheduledOnly ? "1" : "");
  window.history.replaceState({}, "", url);
}

function setUrlParam(params: URLSearchParams, key: string, value: string | null): void {
  if (!value) {
    params.delete(key);
    return;
  }
  params.set(key, value);
}
