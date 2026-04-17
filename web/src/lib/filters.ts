import type { AgendaGroup, Filters, Paper, Workshop, WorkshopFilters } from "../types";

export function filterPapers(papers: Paper[], filters: Filters, bookmarks: Set<string>): Paper[] {
  const queryTerms = filters.query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return [...papers]
    .filter((paper) => {
      if (filters.bookmarkedOnly && !bookmarks.has(paper.paper_id)) {
        return false;
      }
      if (filters.scheduledOnly && !paper.has_schedule) {
        return false;
      }
      if (filters.selectedDate && paper.session_date !== filters.selectedDate) {
        return false;
      }
      if (filters.selectedSessionType && paper.session_type !== filters.selectedSessionType) {
        return false;
      }
      if (filters.selectedTopics.length > 0) {
        const topicSet = new Set(paper.topic_tags);
        const matchesTopic = filters.selectedTopics.some((topic) => topicSet.has(topic));
        if (!matchesTopic) {
          return false;
        }
      }
      if (queryTerms.length > 0) {
        return queryTerms.every((term) => paper.search_blob.includes(term));
      }
      return true;
    })
    .sort(comparePapers);
}

export function comparePapers(left: Paper, right: Paper): number {
  const leftDate = left.session_date || "9999-12-31";
  const rightDate = right.session_date || "9999-12-31";
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }

  const leftStart = left.session_start || "99:99";
  const rightStart = right.session_start || "99:99";
  if (leftStart !== rightStart) {
    return leftStart.localeCompare(rightStart);
  }

  return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
}

export function groupAgenda(bookmarkedPapers: Paper[]): { scheduledGroups: AgendaGroup[]; unscheduled: Paper[] } {
  const scheduled = bookmarkedPapers.filter((paper) => paper.has_schedule).sort(comparePapers);
  const unscheduled = bookmarkedPapers.filter((paper) => !paper.has_schedule).sort(comparePapers);

  const scheduledGroups: AgendaGroup[] = [];
  let currentDate = "";
  let currentGroup: AgendaGroup | null = null;

  for (const paper of scheduled) {
    if (paper.session_date !== currentDate) {
      currentDate = paper.session_date;
      currentGroup = {
        date: paper.session_date,
        label: formatDateLabel(paper.session_date),
        papers: [],
      };
      scheduledGroups.push(currentGroup);
    }
    currentGroup?.papers.push(paper);
  }

  return { scheduledGroups, unscheduled };
}

export function formatDateLabel(value: string): string {
  if (!value) {
    return "Unscheduled";
  }
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

export function formatScheduleLabel(paper: Pick<Paper, "session_date" | "session_start" | "session_end" | "room">): string {
  if (!paper.session_date) {
    return "Schedule pending";
  }

  const dateLabel = formatDateLabel(paper.session_date);
  const timeLabel = paper.session_start && paper.session_end ? `${paper.session_start}-${paper.session_end}` : "Time TBD";
  return paper.room ? `${dateLabel} · ${timeLabel} · ${paper.room}` : `${dateLabel} · ${timeLabel}`;
}

export function filterWorkshops(
  workshops: Workshop[],
  filters: WorkshopFilters,
  bookmarks: Set<string>,
): Workshop[] {
  const queryTerms = filters.query
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  return [...workshops]
    .filter((workshop) => {
      if (filters.savedOnly && !bookmarks.has(workshop.workshop_id)) {
        return false;
      }
      if (filters.scheduledOnly && !workshop.has_schedule) {
        return false;
      }
      if (filters.selectedDate && workshop.session_date !== filters.selectedDate) {
        return false;
      }
      if (filters.selectedRoom && workshop.room !== filters.selectedRoom) {
        return false;
      }
      if (queryTerms.length > 0) {
        return queryTerms.every((term) => workshop.search_blob.includes(term));
      }
      return true;
    })
    .sort(compareWorkshops);
}

export function compareWorkshops(left: Workshop, right: Workshop): number {
  const leftDate = left.session_date || "9999-12-31";
  const rightDate = right.session_date || "9999-12-31";
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }

  const leftStart = left.session_start || "99:99";
  const rightStart = right.session_start || "99:99";
  if (leftStart !== rightStart) {
    return leftStart.localeCompare(rightStart);
  }

  return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
}

export function formatWorkshopScheduleLabel(
  workshop: Pick<Workshop, "session_date" | "session_start" | "session_end" | "room" | "timezone">,
): string {
  if (!workshop.session_date) {
    return "Schedule pending";
  }

  const dateLabel = formatDateLabel(workshop.session_date);
  const timeLabel =
    workshop.session_start && workshop.session_end ? `${workshop.session_start}-${workshop.session_end}` : "Time TBD";
  const locationLabel = workshop.room ? `${timeLabel} · ${workshop.room}` : timeLabel;
  return workshop.timezone ? `${dateLabel} · ${locationLabel} · ${workshop.timezone}` : `${dateLabel} · ${locationLabel}`;
}
