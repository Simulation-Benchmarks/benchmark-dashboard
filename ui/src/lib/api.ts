import type { BenchmarkMetadata, Run, RunValues, SparqlEntry } from './models';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const metadataCache = new Map<string, Promise<BenchmarkMetadata>>();

function cachedMetadata(key: string, path: string): Promise<BenchmarkMetadata> {
  let pending = metadataCache.get(key);
  if (!pending) {
    pending = request<BenchmarkMetadata>(path).catch((error) => {
      metadataCache.delete(key);
      throw error;
    });
    metadataCache.set(key, pending);
  }
  return pending;
}

export const api = {
  runs: (refresh = false) => request<{ items: Run[]; count: number }>(`/api/runs${refresh ? '?refresh=true' : ''}`),
  runValues: (runId: string) => request<RunValues>(`/api/run-values?run_id=${encodeURIComponent(runId)}`),
  runMetadata: (runId: string) => cachedMetadata(`run:${runId}`, `/api/run-metadata?run_id=${encodeURIComponent(runId)}`),
  benchmarkMetadata: (url: string) => cachedMetadata(`benchmark:${url}`, `/api/benchmark-metadata?benchmark_url=${encodeURIComponent(url)}`),
  sparqlLog: () => request<{ items: SparqlEntry[]; count: number }>('/api/sparql-log'),
  clearSparqlLog: () => request<void>('/api/sparql-log', { method: 'DELETE' }),
};
