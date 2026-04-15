const BOOKMARK_STORAGE_KEY = "iclr-explorer.bookmarks.v1";

export function loadBookmarks(): Set<string> {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const rawValue = window.localStorage.getItem(BOOKMARK_STORAGE_KEY);
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

export function saveBookmarks(bookmarks: Iterable<string>): void {
  if (typeof window === "undefined") {
    return;
  }

  const values = Array.from(bookmarks);
  window.localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(values));
}

export function bookmarkStorageKey(): string {
  return BOOKMARK_STORAGE_KEY;
}
