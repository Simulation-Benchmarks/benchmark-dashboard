<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Select from 'primevue/select';
import { colors } from '../lib/theme';
import type { AnalysisRow, RunAnalysisData } from '../lib/analysis';

const props = defineProps<{ data: RunAnalysisData; rows: AnalysisRow[]; maximized: boolean }>();
const plot = ref<HTMLDivElement | null>(null);
const xKey = ref('');
const yKey = ref('');
const xScale = ref<'linear' | 'log'>('linear');
const yScale = ref<'linear' | 'log'>('linear');
const plotMessage = ref('');
const parameterOptions = computed(() => props.data.columns.filter((column) => column.kind === 'parameter').map((column) => ({ label: column.label, value: column.key })));
const metricOptions = computed(() => props.data.columns.filter((column) => column.kind === 'metric').map((column) => ({ label: column.label, value: column.key })));
const scaleOptions = [{ label: 'Linear', value: 'linear' }, { label: 'Logarithmic', value: 'log' }];
let resizeObserver: ResizeObserver | undefined;

watch(() => props.data, () => {
  xKey.value = parameterOptions.value[0]?.value || '';
  yKey.value = metricOptions.value[0]?.value || '';
}, { immediate: true });
watch([() => props.rows, () => props.maximized, colors, xKey, yKey, xScale, yScale], () => void draw(), { deep: true });

async function draw(): Promise<void> {
  await nextTick();
  if (!plot.value || !xKey.value || !yKey.value) return;
  const xColumn = props.data.columns.find((column) => column.key === xKey.value);
  const yColumn = props.data.columns.find((column) => column.key === yKey.value);
  const pairs = props.rows
    .filter((row) => [row[xKey.value], row[yKey.value]].every((value) => value !== null && value !== undefined && value !== ''))
    .map((row) => ({ x: Number(row[xKey.value]), y: Number(row[yKey.value]), series: String(row['__series'] || props.data.payload.software_name || 'Run') }))
    .filter((pair) => Number.isFinite(pair.x) && Number.isFinite(pair.y) && (xScale.value !== 'log' || pair.x > 0) && (yScale.value !== 'log' || pair.y > 0));
  const groups = new Map<string, typeof pairs>();
  pairs.forEach((pair) => groups.set(pair.series, [...(groups.get(pair.series) || []), pair]));
  const traces = [...groups.entries()].map(([name, values]) => {
    const sorted = [...values].sort((a, b) => a.x - b.x);
    return { name, x: sorted.map((value) => value.x), y: sorted.map((value) => value.y), type: 'scatter' as const, mode: 'lines+markers' as const,
      hovertemplate: `${xColumn?.label}: %{x}<br>${yColumn?.label}: %{y}<extra>${name}</extra>` };
  });
  plotMessage.value = `${pairs.length} plotted from ${props.rows.length} filtered observations`;
  const Plotly = (await import('plotly.js-dist-min')).default;
  await Plotly.react(plot.value, traces, {
    margin: { l: 75, r: 24, t: 25, b: 70 }, showlegend: traces.length > 1, hovermode: 'closest',
    paper_bgcolor: colors.value.surface, plot_bgcolor: colors.value.plot,
    font: { color: colors.value.text, family: 'IBM Plex, Arial, sans-serif' },
    colorway: ['#046cb4', '#e6005f', '#f9b200', '#792182', '#00763c', '#ee7202'],
    xaxis: { title: { text: xColumn?.label }, type: xScale.value, automargin: true, gridcolor: colors.value.line, zerolinecolor: colors.value.line },
    yaxis: { title: { text: yColumn?.label, standoff: 14 }, type: yScale.value, automargin: true, gridcolor: colors.value.line, zerolinecolor: colors.value.line },
  }, { responsive: true, displaylogo: false, scrollZoom: true, modeBarButtonsToRemove: ['lasso2d', 'select2d'] });
}

onMounted(() => {
  if (plot.value) {
    resizeObserver = new ResizeObserver(() => { if (plot.value) void import('plotly.js-dist-min').then((module) => module.default.Plots.resize(plot.value!)); });
    resizeObserver.observe(plot.value);
  }
  void draw();
});
onBeforeUnmount(() => { resizeObserver?.disconnect(); if (plot.value) void import('plotly.js-dist-min').then((module) => module.default.purge(plot.value!)); });
</script>

<template>
  <section class="plot-panel" :class="{ maximized }">
    <div class="axis-groups">
      <fieldset><legend>X axis</legend><label>Parameter<Select v-model="xKey" :options="parameterOptions" option-label="label" option-value="value" /></label><label>Scale<Select v-model="xScale" :options="scaleOptions" option-label="label" option-value="value" /></label></fieldset>
      <fieldset><legend>Y axis</legend><label>Metric<Select v-model="yKey" :options="metricOptions" option-label="label" option-value="value" /></label><label>Scale<Select v-model="yScale" :options="scaleOptions" option-label="label" option-value="value" /></label></fieldset>
    </div>
    <p class="plot-message">{{ plotMessage }}</p>
    <div ref="plot" class="plot"></div>
  </section>
</template>
