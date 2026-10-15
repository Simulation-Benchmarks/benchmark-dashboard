export interface Benchmark {
  benchmark_url: string;
  benchmark_title: string;
  research_problem_uri: string;
  version: string | null;
  repo: string | null;
}

export interface Run {
  run_id: string;
  title: string | null;
  benchmark_url: string;
  benchmark_title: string;
  version: string | null;
  branch_url: string | null;
  graph: string | null;
  software_name: string | null;
  software_url: string | null;
  software_version: string | null;
  datePublished: string | null;
}

export interface BenchmarkMetadata {
  benchmark: string;
  parameters: BenchmarkVariable[];
  metrics: BenchmarkVariable[];
}

export interface BenchmarkVariable {
  name: string;
  unit: string | null;
}

export interface ValueColumn {
  key: string;
  label: string;
  kind: 'parameter' | 'metric' | 'calculated';
}

export interface RunValues {
  query?: string;
  columns: ValueColumn[];
  rows: Record<string, unknown>[];
}

export interface SparqlEntry {
  id: number;
  started_at: string;
  query: string;
  status: 'running' | 'succeeded' | 'failed';
  duration_ms: number | null;
  error: string | null;
}
