const BOOKMARK_STORAGE_KEY = "iclr-explorer.bookmarks.v1";
const WORKSHOP_BOOKMARK_STORAGE_KEY = "iclr-explorer.workshops.bookmarks.v1";

export function loadBookmarks(): Set<string> {
  return loadBookmarkSet(BOOKMARK_STORAGE_KEY);
}

export function loadWorkshopBookmarks(): Set<string> {
  return loadBookmarkSet(WORKSHOP_BOOKMARK_STORAGE_KEY);
}

export function saveBookmarks(bookmarks: Iterable<string>): void {
  saveBookmarkSet(BOOKMARK_STORAGE_KEY, bookmarks);
}

export function saveWorkshopBookmarks(bookmarks: Iterable<string>): void {
  saveBookmarkSet(WORKSHOP_BOOKMARK_STORAGE_KEY, bookmarks);
}

function loadBookmarkSet(storageKey: string): Set<string> {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) {
      return new Set<string>();
    }
    const values = JSON.parse(rawValue);
    if (!Array.isArray(values)) {
      return new Set<string>();
    }
    return new Set<string>(values.filter((value): value is string => typeof value === "string"));
  } catch {
    return new Set<string>();
  }
}

function saveBookmarkSet(storageKey: string, bookmarks: Iterable<string>): void {
  if (typeof window === "undefined") {
    return;
  }

  const values = Array.from(bookmarks);
  window.localStorage.setItem(storageKey, JSON.stringify(values));
}

export function bookmarkStorageKey(): string {
  return BOOKMARK_STORAGE_KEY;
}

export function workshopBookmarkStorageKey(): string {
  return WORKSHOP_BOOKMARK_STORAGE_KEY;
}
