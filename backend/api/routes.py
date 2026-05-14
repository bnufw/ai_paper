"""FastAPI route definitions."""

import asyncio
import json
import queue
import threading
from typing import Any
from urllib.parse import parse_qs, urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from loguru import logger

from ..core.venues import get_supported_venues, VENUES
from ..core.fetcher import fetch_papers, is_cached, get_cache_metadata, list_cached_years
from ..core.indexer import build_index, is_indexed, list_indexed_years
from ..core.keyword_extractor import extract_keywords
from ..core.search_engine import hybrid_search
from ..core.evaluator import evaluate_relevance
from ..core.skill_search import search_latest_topic_for_skill, search_multi_venues, resolve_auto_latest_venues
from ..core.translator import translate_papers_bilingual


def _sse_event(event: str, data: Any) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _make_stream_queue() -> tuple[queue.Queue[str | None], Any, threading.Event]:
    """Create a bounded SSE queue and a put helper that aborts abandoned work."""
    q: queue.Queue[str | None] = queue.Queue(maxsize=10)
    cancel_event = threading.Event()

    def safe_put(item: str) -> None:
        if cancel_event.is_set():
            raise InterruptedError("Client disconnected")
        try:
            q.put(item, timeout=15)
        except queue.Full as exc:
            cancel_event.set()
            raise InterruptedError("Client disconnected") from exc

    return q, safe_put, cancel_event


router = APIRouter()

# In-memory job status store (simple, no persistence needed)
_job_status: dict[str, dict] = {}

ALLOWED_PDF_HOST_SUFFIXES = (
    "openreview.net",
    "thecvf.com",
    "arxiv.org",
    "semanticscholar.org",
    "aclanthology.org",
    "proceedings.mlr.press",
    "neurips.cc",
    "nips.cc",
    "aaai.org",
    "doi.org",
)


# ─── Models ────────────────────────────────────────────────────────────────────

class FetchRequest(BaseModel):
    venue: str
    year: int
    force: bool = False


class IndexRequest(BaseModel):
    venue: str
    year: int
    force: bool = False


class SearchRequest(BaseModel):
    venue: str
    year: int
    research_description: str = Field(..., min_length=3)
    top_k: int = Field(default=10, ge=1, le=200)
    max_concurrent: int = Field(default=10, ge=1, le=20)
    use_llm_eval: bool = True
    use_bilingual_translation: bool = True
    use_chinese_relevance_reason: bool = True
    vector_weight: float = Field(default=1.0, ge=0.0)
    keyword_weight: float = Field(default=1.0, ge=0.0)


class VenueYearPair(BaseModel):
    venue: str
    year: int


class MultiSearchRequest(BaseModel):
    research_description: str = Field(..., min_length=3)
    venues: list[VenueYearPair] | None = None
    auto_latest: bool = True
    top_k: int = Field(default=10, ge=1, le=200)
    max_concurrent: int = Field(default=10, ge=1, le=20)
    use_llm_eval: bool = True
    use_chinese_relevance_reason: bool = True
    use_bilingual_translation: bool = False


class SkillLatestTopicSearchRequest(BaseModel):
    topic: str = Field(..., min_length=3)


class PaperResult(BaseModel):
    id: str
    title: str
    title_zh: str = ""
    authors: list[str]
    abstract: str
    abstract_zh: str = ""
    keywords: list[str]
    venue: str
    year: int
    decision: str
    pdf_url: str
    forum_url: str
    relevance_score: float = 0.0
    relevance_reason: str = ""
    rrf_score: float = 0.0
    search_source: str = ""


# ─── Venues ────────────────────────────────────────────────────────────────────

@router.get("/venues")
def list_venues() -> list[dict]:
    """List supported conferences with min_year and status of locally cached/indexed years."""
    venues = get_supported_venues()
    for v in venues:
        cached_years = list_cached_years(v["name"])
        indexed_years = list_indexed_years(v["name"])
        all_years = sorted(set(cached_years) | set(indexed_years))
        status = {}
        for y in all_years:
            meta = get_cache_metadata(v["name"], y) if y in cached_years else None
            status[str(y)] = {
                "fetched": y in cached_years,
                "indexed": y in indexed_years,
                "total_papers": meta.get("total_papers") if meta else None,
                "fetch_date": meta.get("fetch_date") if meta else None,
                "file_size_mb": meta.get("file_size_mb") if meta else None,
            }
        v["status"] = status
    return venues


# ─── PDF proxy ────────────────────────────────────────────────────────────────

def _is_allowed_pdf_url(url: str) -> bool:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return False
    host = (parsed.hostname or "").lower()
    return any(host == suffix or host.endswith(f".{suffix}") for suffix in ALLOWED_PDF_HOST_SUFFIXES)


def _normalize_pdf_source_url(url: str) -> str:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()

    if host in {"arxiv.org", "www.arxiv.org"} and parsed.path.startswith("/abs/"):
        return parsed._replace(path=parsed.path.replace("/abs/", "/pdf/", 1), query="", fragment="").geturl()

    if host == "openreview.net" and parsed.path == "/forum":
        note_id = parse_qs(parsed.query).get("id", [""])[0]
        if note_id:
            return f"https://openreview.net/pdf?id={note_id}"

    return url


def _looks_like_pdf_response(response: requests.Response, source_url: str) -> bool:
    content_type = response.headers.get("content-type", "")
    return "pdf" in content_type.lower() or source_url.lower().split("?", 1)[0].endswith(".pdf")


def _extract_pdf_url_from_html(html: str, base_url: str) -> str | None:
    soup = BeautifulSoup(html, "html.parser")

    meta = soup.select_one("meta[name='citation_pdf_url'][content]")
    if meta:
        candidate = urljoin(base_url, str(meta.get("content", "")))
        if _is_allowed_pdf_url(candidate):
            return _normalize_pdf_source_url(candidate)

    for link in soup.select("a[href]"):
        href = str(link.get("href", ""))
        label = link.get_text(" ", strip=True).lower()
        href_lower = href.lower()
        if not (href_lower.endswith(".pdf") or "/pdf" in href_lower or "/article/download/" in href_lower or "pdf" in label):
            continue
        candidate = urljoin(base_url, href)
        if _is_allowed_pdf_url(candidate):
            return _normalize_pdf_source_url(candidate)

    return None


def _request_pdf_source(url: str) -> requests.Response:
    current_url = url
    for _ in range(6):
        if not _is_allowed_pdf_url(current_url):
            raise HTTPException(status_code=400, detail="Unsupported PDF source.")

        response = requests.get(
            current_url,
            stream=True,
            timeout=60,
            headers={"User-Agent": "paper-reader-pdf-import/1.0"},
            allow_redirects=False,
        )

        if response.is_redirect:
            location = response.headers.get("location")
            response.close()
            if not location:
                raise HTTPException(status_code=502, detail="PDF source returned an invalid redirect.")
            current_url = urljoin(current_url, location)
            continue

        response.raise_for_status()
        return response

    raise HTTPException(status_code=502, detail="PDF source redirected too many times.")


@router.get("/download-pdf")
def download_pdf(url: str = Query(..., min_length=8)):
    """Download a paper PDF for browser clients that cannot fetch it directly."""
    if not _is_allowed_pdf_url(url):
        raise HTTPException(status_code=400, detail="Unsupported PDF source.")

    source_url = _normalize_pdf_source_url(url)
    try:
        response = _request_pdf_source(source_url)
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Failed to download PDF: {exc}") from exc

    if not _looks_like_pdf_response(response, source_url):
        content_type = response.headers.get("content-type", "")
        resolved_url = None
        if "html" in content_type.lower():
            resolved_url = _extract_pdf_url_from_html(response.text, response.url)

        if not resolved_url:
            response.close()
            raise HTTPException(status_code=502, detail="Downloaded file does not look like a PDF.")

        response.close()
        try:
            response = _request_pdf_source(resolved_url)
        except requests.RequestException as exc:
            raise HTTPException(status_code=502, detail=f"Failed to download PDF: {exc}") from exc

    if not _looks_like_pdf_response(response, response.url):
        response.close()
        raise HTTPException(status_code=502, detail="Downloaded file does not look like a PDF.")

    def iter_pdf():
        try:
            for chunk in response.iter_content(chunk_size=1024 * 128):
                if chunk:
                    yield chunk
        finally:
            response.close()

    return StreamingResponse(iter_pdf(), media_type="application/pdf")


# ─── Data fetch ────────────────────────────────────────────────────────────────

@router.post("/fetch")
async def fetch_venue_papers(req: FetchRequest, background_tasks: BackgroundTasks) -> dict:
    """Start fetching papers for a venue/year in the background."""
    job_id = f"fetch_{req.venue}_{req.year}"

    if job_id in _job_status and _job_status[job_id].get("status") == "running":
        return {"job_id": job_id, "status": "already_running"}

    _job_status[job_id] = {"status": "running", "progress": 0, "total": 0, "message": "Starting..."}

    def run():
        try:
            def progress_cb(current, total, msg):
                _job_status[job_id].update({"progress": current, "total": total, "message": msg})

            result = fetch_papers(req.venue, req.year, force=req.force, progress_callback=progress_cb)
            _job_status[job_id] = {"status": "done", "result": result, "message": "Complete"}
        except Exception as e:
            logger.error(f"Fetch job {job_id} failed: {e}")
            _job_status[job_id] = {"status": "error", "message": str(e)}

    background_tasks.add_task(run)
    return {"job_id": job_id, "status": "started"}


@router.get("/fetch/{venue}/{year}/status")
def fetch_status(venue: str, year: int) -> dict:
    """Get fetch job status."""
    job_id = f"fetch_{venue}_{year}"
    if job_id not in _job_status:
        cached = is_cached(venue, year)
        meta = get_cache_metadata(venue, year) if cached else None
        return {
            "status": "done" if cached else "not_started",
            "cached": cached,
            "metadata": meta,
        }
    return _job_status[job_id]


# ─── Index ─────────────────────────────────────────────────────────────────────

@router.post("/index")
async def index_venue_papers(req: IndexRequest, background_tasks: BackgroundTasks) -> dict:
    """Build vector index for a venue/year in the background."""
    if not is_cached(req.venue, req.year):
        raise HTTPException(status_code=400, detail=f"No data for {req.venue} {req.year}. Fetch first.")

    job_id = f"index_{req.venue}_{req.year}"

    if job_id in _job_status and _job_status[job_id].get("status") == "running":
        return {"job_id": job_id, "status": "already_running"}

    _job_status[job_id] = {"status": "running", "progress": 0, "total": 0, "message": "Starting..."}

    def run():
        try:
            def progress_cb(current, total, msg):
                _job_status[job_id].update({"progress": current, "total": total, "message": msg})

            result = build_index(req.venue, req.year, force=req.force, progress_callback=progress_cb)
            _job_status[job_id] = {"status": "done", "result": result, "message": "Complete"}
        except Exception as e:
            logger.error(f"Index job {job_id} failed: {e}")
            _job_status[job_id] = {"status": "error", "message": str(e)}

    background_tasks.add_task(run)
    return {"job_id": job_id, "status": "started"}


@router.get("/index/{venue}/{year}/status")
def index_status(venue: str, year: int) -> dict:
    """Get index job status."""
    job_id = f"index_{venue}_{year}"
    if job_id not in _job_status:
        indexed = is_indexed(venue, year)
        return {"status": "done" if indexed else "not_started", "indexed": indexed}
    return _job_status[job_id]


# ─── Search ────────────────────────────────────────────────────────────────────

@router.post("/search")
def search_papers(req: SearchRequest):
    """Search and rank papers via SSE stream with progress events."""
    if not is_cached(req.venue, req.year):
        raise HTTPException(
            status_code=400,
            detail=f"No data for {req.venue} {req.year}. Please fetch papers first."
        )

    q, safe_put, cancel_event = _make_stream_queue()

    def _run():
        try:
            safe_put(_sse_event("progress", {"stage": "keywords", "message": "Extracting keywords..."}))
            logger.info(f"Search: {req.venue} {req.year} | '{req.research_description[:60]}'")
            kw_result = extract_keywords(req.research_description)
            all_keywords = kw_result["all_terms"]

            safe_put(_sse_event("progress", {"stage": "search", "venue": req.venue, "year": req.year, "message": f"Searching {req.venue} {req.year}..."}))
            candidates = hybrid_search(
                query_text=req.research_description,
                keywords=all_keywords,
                venue=req.venue,
                year=req.year,
                top_k=req.top_k * 3 if req.use_llm_eval else req.top_k,
                vector_weight=req.vector_weight,
                keyword_weight=req.keyword_weight,
            )

            if not candidates:
                safe_put(_sse_event("result", {
                    "papers": [], "keywords": kw_result["keywords"],
                    "expanded_keywords": kw_result["expanded"], "total_candidates": 0,
                }))
                return

            if req.use_llm_eval:
                total_candidates = len(candidates)

                def eval_cb(evaluated: int, total: int):
                    safe_put(_sse_event("progress", {
                        "stage": "eval", "venue": req.venue, "year": req.year,
                        "evaluated": evaluated, "total": total,
                        "message": f"Scoring {evaluated}/{total} papers...",
                    }))

                papers = evaluate_relevance(
                    papers=candidates,
                    research_description=req.research_description,
                    top_k=req.top_k,
                    max_concurrent=req.max_concurrent,
                    use_chinese_reason=req.use_chinese_relevance_reason,
                    progress_callback=eval_cb,
                )
            else:
                total_candidates = len(candidates)
                papers = candidates[:req.top_k]
                for p in papers:
                    p["relevance_score"] = p.get("rrf_score", 0.0)
                    p["relevance_reason"] = ""

            if req.use_bilingual_translation:
                def translate_cb(translated: int, total: int):
                    safe_put(_sse_event("progress", {
                        "stage": "translate", "venue": req.venue, "year": req.year,
                        "translated": translated, "total": total,
                        "message": f"Translating {translated}/{total} papers...",
                    }))

                papers = translate_papers_bilingual(
                    papers=papers,
                    max_concurrent=req.max_concurrent,
                    progress_callback=translate_cb,
                )
            else:
                for p in papers:
                    p["title_zh"] = p.get("title", "")
                    p["abstract_zh"] = p.get("abstract", "")

            result_papers = []
            for p in papers:
                pdf_url = p.get("pdf_url") or ""
                forum_url = p.get("forum_url") or ""
                result_papers.append({
                    "id": p.get("id") or "",
                    "title": p.get("title") or "",
                    "title_zh": p.get("title_zh") or "",
                    "authors": p.get("authors") or [],
                    "abstract": p.get("abstract") or "",
                    "abstract_zh": p.get("abstract_zh") or "",
                    "keywords": p.get("keywords") or [],
                    "venue": p.get("venue", req.venue),
                    "year": p.get("year", req.year),
                    "decision": p.get("decision") or "N/A",
                    "pdf_url": pdf_url,
                    "forum_url": forum_url,
                    "relevance_score": round(p.get("relevance_score") or 0.0, 4),
                    "relevance_reason": p.get("relevance_reason") or "",
                    "rrf_score": round(p.get("rrf_score") or 0.0, 6),
                    "search_source": p.get("search_source") or "",
                })

            safe_put(_sse_event("result", {
                "papers": result_papers,
                "keywords": kw_result["keywords"],
                "expanded_keywords": kw_result["expanded"],
                "total_candidates": total_candidates,
            }))
        except InterruptedError:
            logger.warning(f"Search client disconnected: {req.venue} {req.year}")
        except Exception as exc:
            try:
                safe_put(_sse_event("error", {"message": str(exc)}))
            except InterruptedError:
                logger.warning(f"Search client disconnected while reporting error: {req.venue} {req.year}")
        finally:
            try:
                q.put(None, timeout=1)
            except queue.Full:
                pass

    threading.Thread(target=_run, daemon=True).start()

    def _stream():
        try:
            while True:
                item = q.get()
                if item is None:
                    break
                yield item
        except GeneratorExit:
            cancel_event.set()
            raise
        finally:
            cancel_event.set()

    return StreamingResponse(_stream(), media_type="text/event-stream")


@router.post("/multi-search")
def multi_search(req: MultiSearchRequest):
    """Search multiple venues via SSE stream with progress events."""
    if req.auto_latest:
        venue_pairs = resolve_auto_latest_venues()
        if not venue_pairs:
            raise HTTPException(
                status_code=400,
                detail="No searchable venues found. Please fetch papers first.",
            )
    else:
        if not req.venues:
            raise HTTPException(
                status_code=400,
                detail="venues is required when auto_latest is false.",
            )
        venue_pairs = [(v.venue, v.year) for v in req.venues]

    q, safe_put, cancel_event = _make_stream_queue()

    def progress_cb(event: dict):
        safe_put(_sse_event("progress", event))

    def _run():
        try:
            result = search_multi_venues(
                topic=req.research_description,
                venue_year_pairs=venue_pairs,
                top_k=req.top_k,
                max_concurrent=req.max_concurrent,
                use_llm_eval=req.use_llm_eval,
                use_chinese_reason=req.use_chinese_relevance_reason,
                use_bilingual_translation=req.use_bilingual_translation,
                progress_callback=progress_cb,
            )
            safe_put(_sse_event("result", result))
        except InterruptedError:
            logger.warning("Multi-search client disconnected")
        except Exception as exc:
            try:
                safe_put(_sse_event("error", {"message": str(exc)}))
            except InterruptedError:
                logger.warning("Multi-search client disconnected while reporting error")
        finally:
            try:
                q.put(None, timeout=1)
            except queue.Full:
                pass

    threading.Thread(target=_run, daemon=True).start()

    def _stream():
        try:
            while True:
                item = q.get()
                if item is None:
                    break
                yield item
        except GeneratorExit:
            cancel_event.set()
            raise
        finally:
            cancel_event.set()

    return StreamingResponse(_stream(), media_type="text/event-stream")


@router.post("/skill/latest-topic-search")
def skill_latest_topic_search(req: SkillLatestTopicSearchRequest) -> dict[str, Any]:
    """Search latest locally indexed flagship-conference papers for skill usage."""
    return search_latest_topic_for_skill(req.topic)
