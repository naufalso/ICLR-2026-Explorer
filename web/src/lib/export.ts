import type { Paper, Workshop } from "../types";
import { formatPaperTitle } from "./title";

const ICS_TIMEZONE = "America/Los_Angeles";

export function buildCsv<T extends object>(columns: string[], rows: T[]): string {
  const lines = [columns.join(",")];
  for (const row of rows) {
    const rowRecord = row as Record<string, unknown>;
    const values = columns.map((column) => {
      const value = rowRecord[column] ?? "";
      return escapeCsvField(
        String(column === "title" ? formatPaperTitle(String(value)) : value),
      );
    });
    lines.push(values.join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function buildIcs(papers: Paper[]): { content: string; skippedCount: number } {
  const scheduled = papers.filter((paper) => paper.session_date && paper.session_start && paper.session_end);
  const skippedCount = papers.length - scheduled.length;
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  const events = scheduled.map((paper) => {
    const start = toIcsDateTime(paper.session_date, paper.session_start);
    const end = toIcsDateTime(paper.session_date, paper.session_end);
    const description = `${paper.abstract}\n\nPaper URL: ${paper.paper_url}`;
    return [
      "BEGIN:VEVENT",
      `UID:${escapeIcsValue(`${paper.paper_id}@iclr-explorer.local`)}`,
      `DTSTAMP:${now}`,
      `DTSTART;TZID=${ICS_TIMEZONE}:${start}`,
      `DTEND;TZID=${ICS_TIMEZONE}:${end}`,
      `SUMMARY:${escapeIcsValue(formatPaperTitle(paper.title))}`,
      `DESCRIPTION:${escapeIcsValue(description)}`,
      `LOCATION:${escapeIcsValue(paper.room)}`,
      `URL:${escapeIcsValue(paper.paper_url)}`,
      "END:VEVENT",
    ].join("\n");
  });

  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ICLR Explorer//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-TIMEZONE:${ICS_TIMEZONE}`,
    ...events,
    "END:VCALENDAR",
  ].join("\n");

  return { content: `${content}\n`, skippedCount };
}

export function buildWorkshopIcs(workshops: Workshop[]): { content: string; skippedCount: number } {
  const scheduled = workshops.filter(
    (workshop) => workshop.session_date && workshop.session_start && workshop.session_end,
  );
  const skippedCount = workshops.length - scheduled.length;
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

  const events = scheduled.map((workshop) => {
    const start = toIcsDateTime(workshop.session_date, workshop.session_start);
    const end = toIcsDateTime(workshop.session_date, workshop.session_end);
    const description = `${workshop.summary}\n\nWorkshop URL: ${workshop.workshop_url}`;
    return [
      "BEGIN:VEVENT",
      `UID:${escapeIcsValue(`${workshop.workshop_id}@iclr-explorer.local`)}`,
      `DTSTAMP:${now}`,
      `DTSTART;TZID=${ICS_TIMEZONE}:${start}`,
      `DTEND;TZID=${ICS_TIMEZONE}:${end}`,
      `SUMMARY:${escapeIcsValue(formatPaperTitle(workshop.title))}`,
      `DESCRIPTION:${escapeIcsValue(description)}`,
      `LOCATION:${escapeIcsValue(workshop.room)}`,
      `URL:${escapeIcsValue(workshop.workshop_url)}`,
      "END:VEVENT",
    ].join("\n");
  });

  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ICLR Explorer//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-TIMEZONE:${ICS_TIMEZONE}`,
    ...events,
    "END:VCALENDAR",
  ].join("\n");

  return { content: `${content}\n`, skippedCount };
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

function escapeCsvField(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, "\"\"")}"`;
  }
  return normalized;
}

function toIcsDateTime(date: string, time: string): string {
  return `${date.replace(/-/g, "")}T${time.replace(":", "")}00`;
}

function escapeIcsValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
