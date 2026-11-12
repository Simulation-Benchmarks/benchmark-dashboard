import { resourceLabel } from './formatters';
import type { Benchmark } from './models';

export interface BenchmarkGroup {
  key: string;
  rows: Benchmark[];
}

const versionCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function benchmarkName(benchmark: Benchmark): string {
  const title = benchmark.benchmark_title.trim();
  const versionSuffix = benchmark.version ? ` (version ${benchmark.version})` : '';
  return (
    (versionSuffix && title.endsWith(versionSuffix)
      ? title.slice(0, -versionSuffix.length)
      : title) ||
    benchmark.benchmark_url ||
    resourceLabel(benchmark.repo)
  );
}

export function groupBenchmarks(benchmarks: Benchmark[]): BenchmarkGroup[] {
  const groups = new Map<string, Benchmark[]>();
  for (const benchmark of benchmarks) {
    const key = benchmarkName(benchmark);
    const rows = groups.get(key) || [];
    rows.push(benchmark);
    groups.set(key, rows);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => ({
      key,
      rows: rows.sort((a, b) => {
        if (!a.version) return b.version ? 1 : 0;
        if (!b.version) return -1;
        return versionCollator.compare(b.version, a.version);
      }),
    }));
}

export function jupyterUrl(repository: string | null): string | null {
  const name = repository
    ?.replace(/\/$/, '')
    .split('/')
    .at(-1)
    ?.replace(/\.git$/, '');
  return name
    ? `https://hub.nfdi-jupyter.de/v2/gh/Simulation-Benchmarks/${encodeURIComponent(name)}/HEAD`
    : null;
}
