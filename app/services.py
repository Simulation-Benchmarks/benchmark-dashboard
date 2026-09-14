from __future__ import annotations

import json
import math
import re
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from threading import Lock
from typing import Any
from urllib.request import Request, urlopen

from dotenv import load_dotenv

# Support a service-local .env file during development. Environment variables
# supplied by the runtime (for example, Podman's --env-file) take precedence.
load_dotenv(Path(__file__).resolve().parent / ".env", override=False)

ZBMATH_API = "https://api.zbmath.org/v1/software"
CACHE_SECONDS = 300
SOFTWARE_LOOKUP_PATH = Path(__file__).resolve().parent / "software_lookup.json"
SOFTWARE_NAME_SOURCE = "lookup"

_cache: tuple[float, list[dict[str, Any]]] | None = None
_cache_lock = Lock()
_sparql_log: deque[dict[str, Any]] = deque(maxlen=100)
_sparql_log_lock = Lock()
_sparql_log_sequence = 0

class UpstreamError(RuntimeError):
    pass


class RunNotFoundError(LookupError):
    pass


def _start_sparql_log(query: str) -> int:
    global _sparql_log_sequence
    with _sparql_log_lock:
        _sparql_log_sequence += 1
        identifier = _sparql_log_sequence
        _sparql_log.appendleft(
            {
                "id": identifier,
                "started_at": datetime.now(timezone.utc).isoformat(),
                "query": query.strip(),
                "status": "running",
                "duration_ms": None,
                "error": None,
            }
        )
        return identifier


def _finish_sparql_log(
    identifier: int, started: float, error: Exception | None = None
) -> None:
    with _sparql_log_lock:
        entry = next((item for item in _sparql_log if item["id"] == identifier), None)
        if entry is not None:
            entry["status"] = "failed" if error else "succeeded"
            entry["duration_ms"] = round((time.monotonic() - started) * 1000, 1)
            entry["error"] = str(error) if error else None


def sparql_log() -> list[dict[str, Any]]:
    """Return a snapshot of recent SPARQL executions, newest first."""
    with _sparql_log_lock:
        return [dict(entry) for entry in _sparql_log]


def clear_sparql_log() -> None:
    with _sparql_log_lock:
        _sparql_log.clear()


def _fetch_json(url: str) -> Any:
    request = Request(
        url,
        headers={"Accept": "application/sparql-results+json, application/json"},
    )
    try:
        with urlopen(request, timeout=20) as response:
            return json.load(response)
    except Exception as error:
        raise UpstreamError(f"Could not load data from {url.split('?')[0]}") from error


@lru_cache(maxsize=1)
def _query_sparql():
    """Configure and return semantic-benchmark's production query helper."""
    from semantic_benchmark.rohub import configure_rohub, query_sparql

    configure_rohub(use_production_rohub=True)
    return query_sparql


def _sparql(query: str) -> list[dict[str, str | None]]:
    started = time.monotonic()
    log_identifier = _start_sparql_log(query)
    try:
        frame = _query_sparql()(query)
        result = frame.to_dict(orient="records")
    except Exception as error:
        _finish_sparql_log(log_identifier, started, error)
        raise UpstreamError("Could not query the production RoHub endpoint") from error
    _finish_sparql_log(log_identifier, started)
    return result


def _software_slug(url: str) -> str:
    return url.rstrip("/").rsplit("/", 1)[-1]


def _software_identifier(url: str) -> str | None:
    match = re.search(r"/software/(\d+)(?:/)?$", url)
    if not match:
        return None
    return match.group(1)


@lru_cache(maxsize=1)
def _software_lookup() -> dict[str, str]:
    try:
        with SOFTWARE_LOOKUP_PATH.open() as handle:
            payload = json.load(handle)
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError as error:
        raise UpstreamError(
            f"Could not parse software lookup data in {SOFTWARE_LOOKUP_PATH.name}"
        ) from error
    return {str(key): str(value) for key, value in payload.items()}


def _software_name_from_api(url: str) -> str:
    identifier = _software_identifier(url)
    if not identifier:
        return _software_slug(url)
    payload = _fetch_json(f"{ZBMATH_API}/{identifier}")
    return payload["result"]["name"]


def _software_name_from_lookup_then_api(url: str) -> str:
    identifier = _software_identifier(url)
    if not identifier:
        return _software_slug(url)
    lookup_name = _software_lookup().get(identifier)
    if lookup_name:
        return lookup_name
    return _software_name_from_api(url)


def _software_names(
    urls: list[str], *, source: str = SOFTWARE_NAME_SOURCE
) -> dict[str, str]:
    if source == "api":
        with ThreadPoolExecutor(max_workers=min(8, len(urls) or 1)) as pool:
            return dict(zip(urls, pool.map(_software_name_from_api, urls)))
    if source == "lookup":
        with ThreadPoolExecutor(max_workers=min(8, len(urls) or 1)) as pool:
            return dict(zip(urls, pool.map(_software_name_from_lookup_then_api, urls)))
    raise UpstreamError(
        "SOFTWARE_NAME_SOURCE must be either 'lookup' or 'api'"
    )


def _benchmark_name(
    benchmark_repo: str | None,
    benchmark_url: str | None = None,
) -> str:
    """Derive the benchmark name used by semantic-benchmark provenance helpers."""
    source = (benchmark_repo or benchmark_url or "").rstrip("/")
    if not source:
        raise UpstreamError("This benchmark does not have an identifier")

    name = source.rsplit("/", 1)[-1]
    if name.endswith(".git"):
        name = name[:-4]
    if not name:
        raise UpstreamError(f"Could not determine a benchmark name from {source}")
    return name


@lru_cache(maxsize=64)
def _benchmark_metadata(
    benchmark_repo: str | None,
    benchmark_url: str | None,
) -> dict[str, Any]:
    """Discover parameter and metric names lazily via provenance queries."""
    from semantic_benchmark.rohub.provenance import (
        configure_rohub,
        discover_benchmark_fields,
        fetch_benchmark_data,
        find_annotated_ro_uuids,
        find_benchmark_ro_uuids,
        find_named_graphs_for_uuids,
    )

    benchmark_name = _benchmark_name(benchmark_repo, benchmark_url)
    try:
        configure_rohub(use_production_rohub=True)
        frame = fetch_benchmark_data(
            benchmark_name=benchmark_name,
            code_repository_url=benchmark_repo,
            use_production_rohub=True,
        )
        if benchmark_repo:
            uuids = find_annotated_ro_uuids(
                benchmark_name=benchmark_name,
                code_repository_url=benchmark_repo,
            )
        else:
            uuids = find_benchmark_ro_uuids(benchmark_name)
        named_graphs = find_named_graphs_for_uuids(
            uuids,
            use_production_rohub=True,
        )
        parameters, metrics = discover_benchmark_fields(list(named_graphs.values()))
        available_columns = {
            str(column)
            for column in frame.columns
            if str(column) != "tool_name"
        }
        parameters = [name for name in parameters if name in available_columns]
        metrics = [
            name for name in metrics
            if name in available_columns and name not in parameters
        ]
        return {
            "benchmark": benchmark_name,
            "parameters": [{"name": name, "unit": None} for name in parameters],
            "metrics": [{"name": name, "unit": None} for name in metrics],
        }
    except Exception as error:
        raise UpstreamError(
            f"Could not load metadata for benchmark {benchmark_name}"
        ) from error


@lru_cache(maxsize=128)
def _run_fields(graph: str) -> tuple[list[str], list[str]]:
    from semantic_benchmark.rohub.provenance import (
        configure_rohub,
        discover_benchmark_fields,
    )

    try:
        configure_rohub(use_production_rohub=True)
        parameters, metrics = discover_benchmark_fields([graph])
    except Exception as error:
        raise UpstreamError(
            "Could not discover parameters and metrics for this run"
        ) from error

    return (
        [str(name) for name in parameters],
        [str(name) for name in metrics],
    )


def _discover_run_fields(run: dict[str, Any]) -> tuple[list[str], list[str]]:
    graph = run.get("graph")
    if not graph:
        raise UpstreamError("This run does not have a named graph")
    return _run_fields(graph)


def _dynamic_query(parameters: list[str], metrics: list[str], graph: str) -> str:
    from semantic_benchmark.rohub.provenance import build_dynamic_query

    return build_dynamic_query(
        parameters=parameters,
        metrics=metrics,
        named_graphs=[graph],
    )


def _safe_variable_name(label: str) -> str:
    from semantic_benchmark.rohub.provenance import sanitize_variable_name

    return sanitize_variable_name(label)


def _json_value(value: Any) -> str | int | float | bool | None:
    if value is None:
        return None
    if hasattr(value, "item"):
        value = value.item()
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def query_run_values(run_id: str) -> dict[str, Any]:
    """Query parameter and metric values from one run's named graph."""
    run = next((item for item in load_runs() if item.get("run_id") == run_id), None)
    if run is None:
        raise RunNotFoundError(f"Published run not found: {run_id}")

    parameters = [item["name"] for item in run.get("parameters") or []]
    metrics = [item["name"] for item in run.get("metrics") or []]
    graph = run.get("graph")
    if not graph:
        raise UpstreamError("This run does not have a named graph")
    if not parameters or not metrics:
        discovered_parameters, discovered_metrics = _discover_run_fields(run)
        if not parameters:
            parameters = discovered_parameters
        if not metrics:
            metrics = discovered_metrics
    if not parameters or not metrics:
        raise UpstreamError("This run does not define both parameters and metrics")

    columns = [
        {"key": _safe_variable_name(label), "label": label, "kind": kind}
        for kind, labels in (("parameter", parameters), ("metric", metrics))
        for label in labels
    ]
    result_rows = _sparql(_dynamic_query(parameters, metrics, graph))
    return {
        "run_id": run_id,
        "software_name": run.get("software_name"),
        "benchmark": run.get("benchmark") or run.get("benchmark_repo"),
        "columns": columns,
        "rows": [
            {column["key"]: _json_value(row.get(column["key"])) for column in columns}
            for row in result_rows
        ],
    }


def load_run_metadata(run_id: str) -> dict[str, Any]:
    """Load parameter and metric metadata only when the UI requests it."""
    run = next((item for item in load_runs() if item.get("run_id") == run_id), None)
    if run is None:
        raise RunNotFoundError(f"Published run not found: {run_id}")

    return _benchmark_metadata(
        run.get("benchmark_repo"),
        run.get("benchmark_url"),
    )


def load_benchmark_metadata(benchmark_url: str) -> dict[str, Any]:
    """Load parameter and metric metadata for one benchmark URL."""
    run = next(
        (item for item in load_runs() if item.get("benchmark_url") == benchmark_url),
        None,
    )
    benchmark_repo = run.get("benchmark_repo") if run else None
    return _benchmark_metadata(benchmark_repo, benchmark_url)


def load_runs(*, force: bool = False) -> list[dict[str, Any]]:
    """Reproduce the notebook dataframe immediately after software_url is dropped."""
    global _cache
    with _cache_lock:
        if not force and _cache and time.monotonic() - _cache[0] < CACHE_SECONDS:
            return _cache[1]

        from semantic_benchmark.rohub.provenance import (
            build_published_runs_query,
            build_run_named_graphs_query,
        )

        rows = _sparql(build_published_runs_query())
        run_ids = [row["run_id"] for row in rows if row.get("run_id")]
        graphs = _sparql(build_run_named_graphs_query(run_ids)) if run_ids else []
        graph_by_run = {row["run_id"]: row.get("graph") for row in graphs}

        software_urls = sorted(
            {row["software_url"] for row in rows if row.get("software_url")}
        )
        names = _software_names(software_urls)

        result = [
            {
                "run_id": row.get("run_id"),
                "benchmark_url": row.get("benchmark_url"),
                "benchmark_repo": row.get("benchmark_repo"),
                "graph": graph_by_run.get(row.get("run_id")),
                "software_name": names.get(row.get("software_url")),
                "software_url": row.get("software_url"),
                "datePublished": row.get("datePublished"),
                "version": row.get("version"),
                "benchmark": "",
                "parameters": [],
                "metrics": [],
            }
            for row in rows
        ]
        result.sort(
            key=lambda row: (row["benchmark_repo"] or "", row["software_name"] or "")
        )
        _cache = (time.monotonic(), result)
        return result
