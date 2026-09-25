from __future__ import annotations

import math
import os
import re
import tempfile
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from threading import Lock
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from dotenv import load_dotenv
from rdflib import Graph

# Support a service-local .env file during development. Environment variables
# supplied by the runtime (for example, Podman's --env-file) take precedence.
load_dotenv(Path(__file__).resolve().parent / ".env", override=False)

CACHE_SECONDS = 300

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


def _benchmark_uuid(benchmark_url: str) -> str:
    """Return the research-object UUID from the URL used by RoHub."""
    identifier = benchmark_url.rstrip("/").rsplit("/", 1)[-1]
    if not re.fullmatch(
        r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}",
        identifier,
    ):
        raise UpstreamError(f"Invalid benchmark RoHub URL: {benchmark_url}")
    return identifier


@lru_cache(maxsize=64)
def _benchmark_metadata(
    benchmark_url: str,
) -> dict[str, Any]:
    """Download and load benchmark metadata with semantic-benchmark."""
    username = os.getenv("ROHUB_USERNAME")
    password = os.getenv("ROHUB_PASSWORD")
    if not username or not password:
        raise UpstreamError(
            "ROHUB_USERNAME and ROHUB_PASSWORD are required to load benchmark metadata"
        )

    from semantic_benchmark import BenchmarkLoader
    from semantic_benchmark.rohub import download_benchmark_resources

    identifier = _benchmark_uuid(benchmark_url)
    try:
        with tempfile.TemporaryDirectory(prefix="benchmark-metadata-") as directory:
            destination = f"{directory}/{identifier}.json"
            download_benchmark_resources(
                identifier,
                username=username,
                password=password,
                path=directory,
                semantic_resource_filename=destination,
                use_production_rohub=True,
            )
            benchmark = BenchmarkLoader(destination).load()

            def variable_metadata(variable: Any) -> dict[str, str | None]:
                return {
                    "name": variable.label or variable.id,
                    "unit": getattr(variable, "unit_iri", None) or variable.unit,
                }

            parameters = [
                variable_metadata(parameter)
                for parameter in (
                    benchmark.parameter_sets[0].parts if benchmark.parameter_sets else []
                )
            ]
            metrics = [variable_metadata(metric) for metric in benchmark.evaluates]
            return {
                "benchmark": benchmark.label or benchmark.id,
                "parameters": parameters,
                "metrics": metrics,
            }
    except Exception as error:
        raise UpstreamError(
            f"Could not load metadata for benchmark {identifier}"
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
    query = _dynamic_query(parameters, metrics, graph)
    result_rows = _sparql(query)
    return {
        "run_id": run_id,
        "software_name": run.get("software_name"),
        "benchmark": run.get("benchmark") or run.get("benchmark_repo"),
        "query": query.strip(),
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
    benchmark_url = run.get("benchmark_url")
    if not benchmark_url:
        raise UpstreamError("This run does not have a benchmark RoHub URL")

    return _benchmark_metadata(benchmark_url)


def load_benchmark_metadata(benchmark_url: str) -> dict[str, Any]:
    """Load parameter and metric metadata for one benchmark URL."""
    return _benchmark_metadata(benchmark_url)


def _graph_has_content(url: str) -> bool:
    """Follow the graph URL and require a nonempty Turtle document."""
    request = Request(url, headers={"Accept": "text/turtle"})
    try:
        with urlopen(request, timeout=20) as response:
            content = response.read()
            resolved_url = response.geturl()
    except HTTPError as error:
        if error.code in (404, 410):
            return False
        raise UpstreamError(f"Could not validate named graph: {url}") from error
    except (URLError, OSError) as error:
        raise UpstreamError(f"Could not validate named graph: {url}") from error

    if not content.strip():
        return False
    try:
        graph = Graph().parse(data=content, format="turtle", publicID=resolved_url)
    except Exception:
        # Includes the upstream literal 'None', HTML, and malformed Turtle.
        return False
    return len(graph) > 0


def _validated_graphs_by_run(
    rows: list[dict[str, Any]],
) -> dict[str, str]:
    """Validate each distinct URL once and prefer valid graphs for each run."""
    urls = sorted({row["graph"] for row in rows if row.get("graph")})
    with ThreadPoolExecutor(max_workers=min(8, len(urls) or 1)) as pool:
        valid_urls = {
            url for url, valid in zip(urls, pool.map(_graph_has_content, urls)) if valid
        }
    result = {}
    for row in rows:
        if row.get("graph") in valid_urls:
            result.setdefault(row["run_id"], row["graph"])
    return result


def load_runs(*, force: bool = False) -> list[dict[str, Any]]:
    """Load published runs and software metadata from their named graphs."""
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
        graph_by_run = _validated_graphs_by_run(graphs)
        metadata_by_run = {
            row["run_id"]: row
            for row in graphs
            if row.get("graph") == graph_by_run.get(row.get("run_id"))
        }

        result = [
            {
                "run_id": row.get("run_id"),
                "benchmark_url": row.get("benchmark_url"),
                "benchmark_repo": row.get("benchmark_repo"),
                "branch_url": row.get("branch_url"),
                "graph": graph_by_run.get(row.get("run_id")),
                "graph_valid": row.get("run_id") in graph_by_run,
                "software_name": _json_value(
                    metadata_by_run.get(row.get("run_id"), {}).get("software_name")
                ),
                "software_url": _json_value(
                    metadata_by_run.get(row.get("run_id"), {}).get("software_url")
                ),
                "software_version": _json_value(
                    metadata_by_run.get(row.get("run_id"), {}).get("software_version")
                ),
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
