from __future__ import annotations

import json
import re

from .models import PaperRecord
from .parser_utils import absolute_url, clean_text, parse_tokens


SESSION_RE = re.compile(
    r"^(Poster|Oral)\s+(?P<weekday>[A-Za-z]{3}),\s+(?P<month>[A-Za-z]{3})\s+"
    r"(?P<day>\d{1,2}),\s+(?P<year>\d{4})\s+[•\-]\s+"
    r"(?P<start>\d{1,2}:\d{2}\s+[AP]M)\s+[–-]\s+(?P<end>\d{1,2}:\d{2}\s+[AP]M)"
)

STOP_ABSTRACT_MARKERS = {
    "Show more",
    "Log in and register to view live content",
    "Successful Page Load",
}
KEYWORDS_RE = re.compile(r'<meta\s+name="keywords"\s+content="([^"]+)"', re.IGNORECASE)
JSON_LD_RE = re.compile(r'<script type="application/ld\+json">\s*(\{.*?\})\s*</script>', re.S)
ABSTRACT_BLOCK_RE = re.compile(r'<div class="[^"]*abstract-text[^"]*">(.*?)</div>', re.S)
H1_RE = re.compile(r"<h1[^>]*>(.*?)</h1>", re.I | re.S)


def parse_detail_page(html: str, record: PaperRecord) -> PaperRecord:
    tokens = parse_tokens(html)
    texts = [token.text for token in tokens]
    if not tokens:
        record.add_note("detail page parsed with no text tokens")
        return record

    session_index = None
    for idx, text in enumerate(texts):
        if SESSION_RE.match(text):
            session_index = idx
            session_match = SESSION_RE.match(text)
            if session_match:
                record.session_type = session_match.group(1)
            break

    if session_index is not None:
        if session_index + 1 < len(texts):
            record.title = texts[session_index + 1] or record.title
        if session_index + 2 < len(texts):
            authors = texts[session_index + 2]
            if not authors.lower().startswith("abstract"):
                record.authors = authors or record.authors

    if not record.title:
        _parse_title(html, record)

    _parse_json_ld_metadata(html, record)
    _parse_keywords_metadata(html, record)
    _parse_abstract_block(html, record)
    if not record.abstract:
        abstract_index = None
        for idx, text in enumerate(texts):
            if text == "Abstract":
                abstract_index = idx
                break

        if abstract_index is not None:
            fragments: list[str] = []
            for idx in range(abstract_index + 1, len(texts)):
                fragment = texts[idx]
                if fragment in STOP_ABSTRACT_MARKERS:
                    break
                if fragment == record.title or fragment == record.authors:
                    continue
                fragments.append(fragment)
            record.abstract = clean_text(" ".join(fragments))

    record.source_detail_url = record.paper_url

    for token in tokens:
        href = absolute_url(token.href)
        label = token.text.lower()
        if not href or href == "https://iclr.cc/":
            continue
        if label == "project page" and not record.project_page:
            record.project_page = href
        elif label == "pdf" and not record.pdf_url:
            record.pdf_url = href
        elif label == "video" and not record.video_url:
            record.video_url = href
        elif label == "poster" and not record.poster_url:
            record.poster_url = href
        elif label == "code" and not record.code_url:
            record.code_url = href
        elif any(host in href.lower() for host in ["github.com", "gitlab.com", "bitbucket.org"]) and not record.code_url:
            record.code_url = href

    if not record.abstract:
        record.add_note("abstract missing from detail page")
    return record


def parse_companion_presentation(html: str) -> dict[str, str]:
    tokens = parse_tokens(html)
    for index in range(len(tokens) - 2):
        candidate_type = tokens[index].text
        if candidate_type not in {"Poster", "Oral"}:
            continue
        if tokens[index + 1].text != "presentation:":
            continue
        session_token = tokens[index + 2]
        return {
            "session_type": candidate_type,
            "session_title": session_token.text,
            "detail_url": absolute_url(tokens[index].href),
        }
    return {}


def _parse_keywords_metadata(html: str, record: PaperRecord) -> None:
    match = KEYWORDS_RE.search(html)
    if not match:
        return
    keywords = clean_text(match.group(1))
    if not keywords:
        return
    record.add_topic(keywords.replace(":", "->", 1) if ":" in keywords else keywords)


def _parse_json_ld_metadata(html: str, record: PaperRecord) -> None:
    match = JSON_LD_RE.search(html)
    if not match:
        return
    try:
        payload = json.loads(match.group(1))
    except json.JSONDecodeError:
        return
    authors = payload.get("author", [])
    names = []
    if isinstance(authors, list):
        for author in authors:
            if isinstance(author, dict) and author.get("name"):
                names.append(clean_text(str(author["name"])))
    if names:
        record.authors = " · ".join(names)


def _parse_abstract_block(html: str, record: PaperRecord) -> None:
    match = ABSTRACT_BLOCK_RE.search(html)
    if not match:
        return
    abstract_html = re.sub(r"<[^>]+>", " ", match.group(1))
    abstract = clean_text(abstract_html)
    if abstract:
        record.abstract = abstract


def _parse_title(html: str, record: PaperRecord) -> None:
    match = H1_RE.search(html)
    if not match:
        return
    title = clean_text(re.sub(r"<[^>]+>", " ", match.group(1)))
    if title:
        record.title = title
