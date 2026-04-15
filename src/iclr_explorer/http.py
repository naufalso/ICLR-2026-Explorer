from __future__ import annotations

from hashlib import sha256
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (compatible; ICLRExplorer/0.1; +https://iclr.cc/)"
)


class HttpClient:
    def __init__(
        self,
        cache_dir: str | Path = ".cache/http",
        refresh: bool = False,
        timeout: int = 30,
        user_agent: str = DEFAULT_USER_AGENT,
        throttle_seconds: float = 0.0,
    ) -> None:
        self.cache_dir = Path(cache_dir)
        self.refresh = refresh
        self.timeout = timeout
        self.user_agent = user_agent
        self.throttle_seconds = throttle_seconds
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def get_text(self, url: str) -> str:
        cache_path = self.cache_dir / f"{sha256(url.encode('utf-8')).hexdigest()}.html"
        if cache_path.exists() and not self.refresh:
            return cache_path.read_text(encoding="utf-8")

        request = Request(url, headers={"User-Agent": self.user_agent})
        last_error: Exception | None = None
        for attempt in range(3):
            try:
                with urlopen(request, timeout=self.timeout) as response:
                    payload = response.read().decode("utf-8", errors="replace")
                cache_path.write_text(payload, encoding="utf-8")
                if self.throttle_seconds:
                    time.sleep(self.throttle_seconds)
                return payload
            except (HTTPError, URLError, TimeoutError) as exc:
                last_error = exc
                if attempt < 2:
                    time.sleep(1.0 * (attempt + 1))
                    continue
                break
        if last_error is None:
            raise RuntimeError(f"Failed to fetch {url}")
        raise RuntimeError(f"Failed to fetch {url}: {last_error}") from last_error
