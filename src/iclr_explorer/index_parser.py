from __future__ import annotations

from html import unescape
import re
from urllib.parse import quote_plus

from .models import PaperRecord
from .parser_utils import absolute_url, parse_tokens


TOPIC_TAGS = [
    "Applications->Chemistry and Drug Discovery",
    "Applications->Climate",
    "Applications->Everything Else",
    "Applications->Genetics, Cell Biology, Health, etc",
    "Applications->Health",
    "Applications->Language, Speech and Dialog",
    "Applications->Neuroscience, Cognitive Science",
    "Applications->Physics",
    "Applications->Robotics",
    "Applications->Time Series",
    "Computer Vision->3D Rendering & Reconstruction",
    "Computer Vision->Classification and Understanding",
    "Computer Vision->Everything Else",
    "Computer Vision->Image and Video Generation",
    "Computer Vision->Segmentation",
    "Computer Vision->Vision Models & Multimodal",
    "Deep Learning->Algorithms",
    "Deep Learning->Attention Mechanisms",
    "Deep Learning->Everything Else",
    "Deep Learning->Generative Models and Autoencoders",
    "Deep Learning->Graph Neural Networks",
    "Deep Learning->Robustness",
    "Deep Learning->Theory",
    "General Machine Learning->Causality",
    "General Machine Learning->Everything Else",
    "General Machine Learning->Probabilistic Methods",
    "General Machine Learning->Representation Learning",
    "General Machine Learning->Transfer, Multitask and Meta-learning",
    "Optimization->Everything Else",
    "Optimization->Global Optimization",
    "Optimization->Large Scale, Parallel and Distributed",
    "Optimization->Learning for Optimization",
    "Optimization->Non-Convex",
    "Optimization->Optimization and Learning under Uncertainty",
    "Optimization->Sampling and Optimization",
    "Optimization->Zero-order and Black-box Optimization",
    "Reinforcement Learning->Batch/Offline",
    "Reinforcement Learning->Deep RL",
    "Reinforcement Learning->Everything Else",
    "Reinforcement Learning->Function Approximation",
    "Reinforcement Learning->Inverse",
    "Reinforcement Learning->Multi-agent",
    "Reinforcement Learning->Online",
    "Reinforcement Learning->Planning",
    "Social Aspects->Accountability, Transparency and Interpretability",
    "Social Aspects->Everything Else",
    "Social Aspects->Fairness, Equity, Justice and Safety",
    "Social Aspects->Privacy-preserving Statistics and Machine Learning",
    "Social Aspects->Trustworthy Machine Learning",
    "Theory->Domain Adaptation and Transfer Learning",
    "Theory->Everything Else",
    "Theory->Game Theory",
    "Theory->Interpretability and Visualization",
    "Theory->Learning Theory",
    "Theory->Optimization",
    "Theory->Probabilistic Methods",
    "Theory->Reinforcement Learning and Planning",
]

PAPER_LIST_URL = "https://iclr.cc/virtual/2026/papers.html?filter=topic&search="
PAPER_MINI_URL = "https://iclr.cc/virtual/2026/papers.html?layout=mini"


def parse_topic_filter_options(html: str) -> list[str]:
    matches = re.findall(r'<option[^>]*value="([^"]+)"', html)
    if not matches:
        return []
    values = [unescape(value) for value in matches if value and value != "All"]
    return [value for value in values if "->" in value]


def build_topic_url(topic_tag: str) -> str:
    return f"{PAPER_LIST_URL}{quote_plus(topic_tag)}"


def _looks_like_author_line(value: str) -> bool:
    return (
        " · " in value
        or ", " in value
        or " and " in value
        or bool(re.search(r"[A-Z][a-z]+ [A-Z][a-z]+", value))
    )


def extract_index_records(html: str, source_list_url: str, topic_tag: str = "") -> list[PaperRecord]:
    tokens = parse_tokens(html)
    records: list[PaperRecord] = []
    seen_urls: set[str] = set()
    for idx, token in enumerate(tokens):
        href = token.href
        if not href or "/virtual/2026/poster/" not in href:
            continue
        paper_url = absolute_url(href)
        if paper_url in seen_urls:
            continue
        seen_urls.add(paper_url)
        title = token.text
        paper_id = paper_url.rstrip("/").split("/")[-1]
        authors = ""
        for look_ahead in range(idx + 1, min(idx + 8, len(tokens))):
            candidate = tokens[look_ahead]
            if candidate.href and "/virtual/2026/poster/" in candidate.href:
                break
            if _looks_like_author_line(candidate.text):
                authors = candidate.text
                break
        record = PaperRecord(
            paper_id=paper_id,
            paper_url=paper_url,
            title=title,
            authors=authors,
            source_list_url=source_list_url,
        )
        if topic_tag:
            record.add_topic(topic_tag)
        records.append(record)
    return records
