from __future__ import annotations

from dataclasses import dataclass
from html import unescape
from html.parser import HTMLParser
import re


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", unescape(value or "")).strip()


def normalize_title(value: str) -> str:
    return clean_text(value)


def absolute_url(url: str) -> str:
    if not url:
        return ""
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if url.startswith("/"):
        return f"https://iclr.cc{url}"
    return f"https://iclr.cc/{url.lstrip('/')}"


def chunk_between(sequence: list[str], start: int, stop_markers: set[str]) -> list[str]:
    values: list[str] = []
    for index in range(start, len(sequence)):
        item = sequence[index]
        if item in stop_markers:
            break
        values.append(item)
    return values


@dataclass
class TextToken:
    index: int
    text: str
    href: str = ""


class LinearizedHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.tokens: list[TextToken] = []
        self._href_stack: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "a":
            return
        attrs_map = dict(attrs)
        self._href_stack.append(attrs_map.get("href") or "")

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._href_stack:
            self._href_stack.pop()

    def handle_data(self, data: str) -> None:
        cleaned = clean_text(data)
        if not cleaned:
            return
        href = self._href_stack[-1] if self._href_stack else ""
        self.tokens.append(TextToken(index=len(self.tokens), text=cleaned, href=href))

    @property
    def texts(self) -> list[str]:
        return [token.text for token in self.tokens]


def parse_tokens(html: str) -> list[TextToken]:
    parser = LinearizedHTMLParser()
    parser.feed(html)
    parser.close()
    return parser.tokens
