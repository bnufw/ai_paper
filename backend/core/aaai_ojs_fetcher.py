"""Fetch AAAI technical-track papers from Open Journal Systems proceedings pages."""

import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup, Tag
from loguru import logger

AAAI_OJS_BASE_URL = "https://ojs.aaai.org"
AAAI_ARCHIVE_URL = f"{AAAI_OJS_BASE_URL}/index.php/AAAI/issue/archive"
USER_AGENT = "aaai-ojs-metadata-fetcher/1.0 (respectful; rate-limited)"


def _clean_text(value: str | Tag | None) -> str:
    if value is None:
        return ""
    if isinstance(value, Tag):
        value = value.get_text(" ", strip=True)
    return re.sub(r"\s+", " ", str(value)).strip()


def _polite_get(
    url: str,
    session: requests.Session,
    retries: int = 3,
    timeout: int = 30,
    sleep: float = 0.3,
) -> requests.Response:
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            response = session.get(url, timeout=timeout)
            if response.status_code == 200:
                return response
            logger.warning(f"HTTP {response.status_code} for {url}")
        except Exception as exc:
            last_exc = exc
            logger.warning(f"Attempt {attempt + 1}/{retries} failed for {url}: {exc}")
        time.sleep(sleep * (attempt + 1))
    if last_exc:
        raise last_exc
    raise RuntimeError(f"Failed to GET {url} after {retries} retries")


def _technical_track_marker(year: int) -> str:
    short_year = str(year % 100).zfill(2)
    return f"AAAI-{short_year} Technical Tracks"


def _archive_page_url(page: int) -> str:
    return AAAI_ARCHIVE_URL if page == 1 else f"{AAAI_ARCHIVE_URL}/{page}"


def _discover_issue_urls(
    year: int,
    session: requests.Session,
    max_archive_pages: int = 12,
) -> list[dict[str, str]]:
    """Find AAAI technical-track proceedings issue URLs for a conference year."""
    marker = _technical_track_marker(year)
    issues: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    found_target = False

    for page in range(1, max_archive_pages + 1):
        url = _archive_page_url(page)
        logger.info(f"Fetching AAAI archive page: {url}")
        response = _polite_get(url, session)
        soup = BeautifulSoup(response.text, "html.parser")
        page_found = False

        for link in soup.select("h2 a.title[href*='/issue/view/']"):
            title = _clean_text(link)
            if not title.startswith(marker):
                continue

            issue_url = urljoin(AAAI_OJS_BASE_URL, link["href"])
            if issue_url in seen_urls:
                continue
            seen_urls.add(issue_url)
            issues.append({"title": title, "url": issue_url})
            page_found = True
            found_target = True

        if found_target and not page_found:
            break

    return issues


def _pdf_download_url(url: str) -> str:
    return re.sub(r"/article/view/(\d+)/(\d+)", r"/article/download/\1/\2", url)


def _parse_issue_page(html: str, issue_title: str, issue_url: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    articles: list[dict[str, Any]] = []

    for item in soup.select(".obj_article_summary"):
        title_link = item.select_one("h3.title a[href*='/article/view/']")
        if not title_link:
            continue

        article_url = urljoin(AAAI_OJS_BASE_URL, title_link["href"])
        article_id_match = re.search(r"/article/view/(\d+)", article_url)
        if not article_id_match:
            continue
        article_id = article_id_match.group(1)

        authors_text = _clean_text(item.select_one(".authors"))
        authors = [part.strip() for part in authors_text.split(",") if part.strip()]

        pdf_url = ""
        pdf_link = item.select_one("a.obj_galley_link.pdf[href]")
        if pdf_link:
            pdf_url = _pdf_download_url(urljoin(AAAI_OJS_BASE_URL, pdf_link["href"]))

        articles.append({
            "id": f"aaai-ojs-{article_id}",
            "article_id": article_id,
            "title": _clean_text(title_link),
            "authors": authors,
            "abstract": "",
            "keywords": [],
            "pdf_url": pdf_url,
            "forum_url": article_url,
            "issue_title": issue_title,
            "issue_url": issue_url,
            "pages": _clean_text(item.select_one(".pages")),
            "doi": "",
        })

    return articles


def _meta_values(soup: BeautifulSoup, name: str) -> list[str]:
    values: list[str] = []
    for node in soup.select(f"meta[name='{name}'][content]"):
        value = _clean_text(node.get("content", ""))
        if value:
            values.append(value)
    return values


def _parse_article_detail(html: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "html.parser")

    abstract = ""
    abstract_node = soup.select_one("section.item.abstract")
    if abstract_node:
        label = abstract_node.select_one(".label")
        if label:
            label.decompose()
        abstract = _clean_text(abstract_node)

    title_values = _meta_values(soup, "citation_title")
    authors = _meta_values(soup, "citation_author")
    doi_values = _meta_values(soup, "citation_doi")
    pdf_values = _meta_values(soup, "citation_pdf_url")

    return {
        "title": title_values[0] if title_values else "",
        "authors": authors,
        "abstract": abstract,
        "doi": doi_values[0] if doi_values else "",
        "pdf_url": pdf_values[0] if pdf_values else "",
    }


def _fetch_article_detail(article: dict[str, Any]) -> dict[str, Any]:
    with requests.Session() as session:
        session.headers.update({"User-Agent": USER_AGENT})
        response = _polite_get(article["forum_url"], session)

    detail = _parse_article_detail(response.text)
    enriched = dict(article)
    if detail["title"]:
        enriched["title"] = detail["title"]
    if detail["authors"]:
        enriched["authors"] = detail["authors"]
    if detail["abstract"]:
        enriched["abstract"] = detail["abstract"]
    if detail["doi"]:
        enriched["doi"] = detail["doi"]
        enriched["doi_url"] = f"https://doi.org/{detail['doi']}"
    if detail["pdf_url"]:
        enriched["pdf_url"] = detail["pdf_url"]
    return enriched


def fetch_aaai_ojs_papers(
    venue: str,
    year: int,
    progress_callback: Callable[[int, int, str], None] | None = None,
    max_detail_workers: int = 8,
) -> list[dict[str, Any]]:
    """Fetch AAAI technical-track papers from AAAI OJS for a conference year."""
    if venue.upper() != "AAAI":
        raise ValueError(f"AAAI OJS fetcher only supports AAAI, got {venue}")

    with requests.Session() as session:
        session.headers.update({"User-Agent": USER_AGENT})
        if progress_callback:
            progress_callback(0, 0, f"Discovering AAAI {year} technical-track issues")

        issues = _discover_issue_urls(year, session)
        if not issues:
            logger.warning(f"No AAAI OJS technical-track issues found for {year}")
            return []

        logger.success(f"Found {len(issues)} AAAI OJS issues for {year}")

        entries: list[dict[str, Any]] = []
        for i, issue in enumerate(issues, 1):
            if progress_callback:
                progress_callback(i, len(issues), f"Fetching issue {i}/{len(issues)}: {issue['title']}")
            response = _polite_get(issue["url"], session)
            entries.extend(_parse_issue_page(response.text, issue["title"], issue["url"]))

    if not entries:
        logger.warning(f"No AAAI OJS papers found for {year}")
        return []

    total = len(entries)
    papers_by_id: dict[str, dict[str, Any]] = {}
    completed = 0

    if progress_callback:
        progress_callback(0, total, f"Fetching AAAI article details 0/{total}")

    with ThreadPoolExecutor(max_workers=max_detail_workers) as executor:
        futures = {executor.submit(_fetch_article_detail, entry): entry for entry in entries}
        for future in as_completed(futures):
            entry = futures[future]
            try:
                paper = future.result()
            except Exception as exc:
                logger.warning(f"Failed to fetch AAAI article detail for '{entry['title']}': {exc}")
                paper = entry

            paper.update({
                "venue": venue,
                "year": year,
                "decision": "Accept",
                "reviews": [],
                "rating_avg": None,
                "confidence_avg": None,
                "meta_review": "",
                "author_remarks": "",
                "decision_comment": "",
            })
            papers_by_id[paper["id"]] = paper
            completed += 1

            if progress_callback and (completed == total or completed % 25 == 0):
                progress_callback(completed, total, f"Fetching AAAI article details {completed}/{total}")

    papers = [papers_by_id[entry["id"]] for entry in entries if entry["id"] in papers_by_id]
    logger.success(f"Fetched {len(papers)} papers for {venue} {year} from AAAI OJS")
    return papers
