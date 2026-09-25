import { api } from './api';
import type { Run, RunValues, ValueColumn } from './models';
import { resourceLabel } from './formatters';

export type AnalysisRow = Record<string, unknown>;
export interface RunAnalysisData {
  payload: RunValues;
  rows: AnalysisRow[];
  columns: ValueColumn[];
  runCount: number;
}

export async function loadAnalysis(runs: Run[]): Promise<RunAnalysisData> {
  const responses = await Promise.all(runs.map((run) => api.runValues(run.run_id)));
  const benchmarkLabel = runs[0]?.benchmark || resourceLabel(runs[0]?.benchmark_repo);
  const columnsByKey = new Map<string, ValueColumn>();
  for (const response of responses) {
    for (const column of response.columns) {
      if (!columnsByKey.has(column.key)) columnsByKey.set(column.key, column);
    }
  }
  const columns = [...columnsByKey.values()];
  const rawRows: AnalysisRow[] = responses.flatMap((response, index) => {
    const run = runs[index];
    const shortRun =
      run.run_id.replace(/\/$/, '').split('/').at(-1)?.slice(0, 8) || run.run_id.slice(0, 8);
    const software = run.software_name || 'Unknown software';
    return response.rows.map((row) => ({
      ...row,
      __software: software,
      __run_id: shortRun,
      __series: `${software} — ${shortRun}`,
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
    columns,
    rows,
    runCount: runs.length,
    payload: {
      benchmark: benchmarkLabel,
      software_name: runs.length === 1 ? runs[0].software_name : null,
      run_count: runs.length,
      columns,
      rows,
    },
  };
}
