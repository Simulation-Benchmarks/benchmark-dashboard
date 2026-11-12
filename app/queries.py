"""Dashboard discovery queries for RoHub benchmarks and published runs."""

DCTERMS = "http://purl.org/dc/terms/"
M4I = "http://w3id.org/nfdi4ing/metadata4ing#"
SCHEMA = "https://schema.org/"
SCHEMA_HTTP = "http://schema.org/"


def build_benchmarks_query() -> str:
    return f"""
    PREFIX schema: <{SCHEMA}>
    PREFIX m4i: <{M4I}>
    PREFIX dcterms: <{DCTERMS}>

    SELECT DISTINCT ?benchmark_url ?benchmark_title ?description ?research_problem_uri ?version ?repo
    WHERE {{
        ?benchmark_url dcterms:title ?benchmark_title .
        ?benchmark_url m4i:investigates ?research_problem_uri .
        ?benchmark_url schema:version ?version .
        ?benchmark_url schema:codeRepository ?repo .
        OPTIONAL {{ ?benchmark_url dcterms:description ?description . }}
    }}
    """


def build_published_runs_query() -> str:
    return f"""
    PREFIX schema: <{SCHEMA}>
    PREFIX schema_http: <{SCHEMA_HTTP}>
    PREFIX m4i: <{M4I}>
    PREFIX dcterms: <{DCTERMS}>

    SELECT DISTINCT ?run_id ?title ?description ?benchmark_url ?benchmark_title ?research_problem_uri ?branch_url ?datePublished ?version
    WHERE {{
        ?run_id m4i:investigates ?benchmark_url .
        ?run_id schema_http:datePublished ?datePublished .
        ?run_id schema:codeRepository ?branch_url .
        OPTIONAL {{ ?run_id dcterms:title ?title . }}
        OPTIONAL {{ ?run_id dcterms:description ?description . }}
        ?benchmark_url dcterms:title ?benchmark_title .
        ?benchmark_url m4i:investigates ?research_problem_uri .
        ?benchmark_url schema:version ?version .
    }}
    """
