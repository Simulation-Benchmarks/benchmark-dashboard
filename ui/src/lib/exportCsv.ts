import type { AnalysisRow, RunAnalysisData } from './analysis';
import type { ValueColumn } from './models';

export function exportAnalysisCsv(
  analysis: RunAnalysisData,
  columns: ValueColumn[],
  rows: AnalysisRow[],
): void {
  const exportedColumns = [
    ...(analysis.runCount > 1
      ? [
          { key: '__software', label: 'Software' },
          { key: '__software_version', label: 'Software Version' },
          { key: '__run_id', label: 'Run' },
        ]
      : []),
    ...columns,
  ];
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [
    exportedColumns.map((column) => escape(column.label)).join(','),
    ...rows.map((row) => exportedColumns.map((column) => escape(row[column.key])).join(',')),
  ].join('\r\n');
  const name = analysis.benchmark
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name || 'benchmark-values'}${analysis.runCount > 1 ? '-comparison' : ''}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
