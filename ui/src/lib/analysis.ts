import { api } from './api';
import type { Run, ValueColumn } from './models';

export type AnalysisRow = Record<string, unknown>;
export interface RunAnalysisData {
  benchmark: string;
  rows: AnalysisRow[];
  columns: ValueColumn[];
  runCount: number;
  runDetails: {
    runId: string;
    softwareName: string;
    softwareVersion: string | null;
    query: string;
  }[];
}

export async function loadAnalysis(runs: Run[]): Promise<RunAnalysisData> {
  const responses = await Promise.all(runs.map((run) => api.runValues(run.run_id)));
  const benchmarkLabel = runs[0]?.benchmark_title || 'Benchmark';
  const columnsByKey = new Map<string, ValueColumn>();
  for (const response of responses) {
    for (const column of response.columns) {
      if (!columnsByKey.has(column.key)) columnsByKey.set(column.key, column);
    }
  }
  const columns = [...columnsByKey.values()];
  const runDetails = runs.map((run, index) => ({
    runId: run.run_id,
    softwareName: run.software_name || 'Unknown software',
    softwareVersion: run.software_version,
    query: responses[index].query || '',
  }));
  const rawRows: AnalysisRow[] = responses.flatMap((response, index) => {
    const run = runs[index];
    const shortRun =
      run.run_id.replace(/\/$/, '').split('/').at(-1)?.slice(0, 8) || run.run_id.slice(0, 8);
    const { softwareName, softwareVersion } = runDetails[index];
    return response.rows.map((row) => ({
      ...row,
      __software: softwareName,
      __software_version: softwareVersion || '—',
      __run_id: shortRun,
      __tool_name: row.__tool_name,
    }));
  });
  const numeric = new Set(
    columns
      .filter((column) => {
        const values = rawRows
          .map((row) => row[column.key])
          .filter((value) => value !== null && value !== undefined && value !== '');
        return values.length && values.every((value) => Number.isFinite(Number(value)));
      })
      .map((column) => column.key),
  );
  const rows = rawRows.map((row) => ({
    ...row,
    ...Object.fromEntries(
      columns.map((column) => {
        const value = row[column.key];
        if (value === null || value === undefined || value === '') return [column.key, null];
        return [column.key, numeric.has(column.key) ? Number(value) : String(value)];
      }),
    ),
  }));
  return {
    benchmark: benchmarkLabel,
    columns,
    rows,
    runCount: runs.length,
    runDetails,
  };
}
