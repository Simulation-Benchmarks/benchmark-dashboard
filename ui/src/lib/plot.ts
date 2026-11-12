import type { AnalysisRow } from './analysis';
import type { ValueColumn } from './models';

export type PlotScale = 'linear' | 'log';

function wrapLegendLabel(label: string): string {
  const escape = (part: string) =>
    part.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const lines: string[] = [];
  let remaining = label.trim();
  while (remaining.length > 32) {
    const space = remaining.lastIndexOf(' ', 32);
    const split = space > 0 ? space : 32;
    lines.push(escape(remaining.slice(0, split)));
    remaining = remaining.slice(split).trimStart();
  }
  if (remaining) lines.push(escape(remaining));
  return lines.join('<br>');
}

export function buildPlotTraces(options: {
  rows: AnalysisRow[];
  columns: ValueColumn[];
  xKey: string;
  yKey: string;
  groupKeys: string[];
  groupLabels: Map<string, string>;
  xScale: PlotScale;
  yScale: PlotScale;
}) {
  const { rows, columns, xKey, yKey, groupKeys, groupLabels, xScale, yScale } = options;
  const xLabel = columns.find((column) => column.key === xKey)?.label;
  const yLabel = columns.find((column) => column.key === yKey)?.label;
  const pairs = rows
    .filter((row) =>
      [row[xKey], row[yKey]].every(
        (value) => value !== null && value !== undefined && value !== '',
      ),
    )
    .map((row) => {
      const values = groupKeys.map((key) => String(row[key] ?? '') || 'No value');
      return {
        x: Number(row[xKey]),
        y: Number(row[yKey]),
        seriesId: JSON.stringify(values),
        series: groupKeys.length
          ? groupKeys
              .map((key, index) => `${groupLabels.get(key) || key}: ${values[index]}`)
              .join(' · ')
          : 'All observations',
      };
    })
    .filter(
      (pair) =>
        Number.isFinite(pair.x) &&
        Number.isFinite(pair.y) &&
        (xScale !== 'log' || pair.x > 0) &&
        (yScale !== 'log' || pair.y > 0),
    );
  const groups = new Map<string, typeof pairs>();
  pairs.forEach((pair) => groups.set(pair.seriesId, [...(groups.get(pair.seriesId) || []), pair]));
  const traces = [...groups.values()].map((values) => {
    const name = values[0].series;
    const sorted = [...values].sort((a, b) => a.x - b.x);
    return {
      name: wrapLegendLabel(name),
      x: sorted.map((value) => value.x),
      y: sorted.map((value) => value.y),
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      hovertemplate: `${xLabel}: %{x}<br>${yLabel}: %{y}<extra>${name}</extra>`,
    };
  });
  return { traces, count: pairs.length, xLabel, yLabel };
}
