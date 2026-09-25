<script setup lang="ts">
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import InputText from 'primevue/inputtext';
import ProgressSpinner from 'primevue/progressspinner';
import type { Run } from '../lib/models';
import type { AnalysisRow, RunAnalysisData } from '../lib/analysis';
import { loadAnalysis } from '../lib/analysis';
import ComparisonPlot from './ComparisonPlot.vue';

const visible = ref(false);
const loading = ref(false);
const error = ref('');
const title = ref('Parameters and metrics');
const tab = ref('values');
const maximized = ref(false);
const analysis = ref<RunAnalysisData | null>(null);
const columnFilters = ref<Record<string, string>>({});
const filteredRows = computed<AnalysisRow[]>(() => {
  if (!analysis.value) return [];
  return analysis.value.rows.filter((row) => Object.entries(columnFilters.value).every(([key, term]) =>
    !term || String(row[key] ?? '').toLocaleLowerCase().includes(term.toLocaleLowerCase())));
});
const context = computed(() => analysis.value
  ? `${analysis.value.runCount} ${analysis.value.runCount === 1 ? 'run' : 'runs'} · ${filteredRows.value.length} of ${analysis.value.rows.length} observations`
  : '');
let requestId = 0;

async function open(runs: Run[]): Promise<void> {
  if (!runs.length) return;
  const current = ++requestId;
  visible.value = true;
  loading.value = true;
  error.value = '';
  analysis.value = null;
  columnFilters.value = {};
  tab.value = 'values';
  title.value = runs.length > 1 ? 'Loading comparison…' : 'Loading run values…';
  try {
    const result = await loadAnalysis(runs);
    if (current !== requestId) return;
    analysis.value = result;
    title.value = result.payload.benchmark || 'Parameters and metrics';
  } catch (cause) {
    if (current !== requestId) return;
    error.value = cause instanceof Error ? cause.message : 'Run values could not be loaded.';
  } finally {
    if (current === requestId) loading.value = false;
  }
}
defineExpose({ open });

function exportCsv(): void {
  if (!analysis.value) return;
  const columns = [
    ...(analysis.value.runCount > 1 ? [{ key: '__software', label: 'Software' }, { key: '__run_id', label: 'Run' }] : []),
    ...analysis.value.columns,
  ];
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [columns.map((column) => escape(column.label)).join(','), ...filteredRows.value.map((row) => columns.map((column) => escape(row[column.key])).join(','))].join('\r\n');
  const name = (analysis.value.payload.benchmark || 'benchmark-values').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name || 'benchmark-values'}${analysis.value.runCount > 1 ? '-comparison' : ''}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <Dialog v-model:visible="visible" modal maximizable :style="{ width: 'min(1120px, 96vw)' }" :content-style="{ height: 'min(680px, 76vh)' }" @maximize="maximized = true" @unmaximize="maximized = false">
    <template #header><div><span class="eyebrow">Run values</span><h2>{{ title }}</h2><small>{{ context }}</small></div></template>
    <div v-if="loading" class="analysis-state"><ProgressSpinner aria-label="Loading run values" /><p>Running SPARQL queries…</p></div>
    <p v-else-if="error" class="analysis-state error">{{ error }}</p>
    <Tabs v-else-if="analysis" v-model:value="tab">
      <TabList><Tab value="values">Values</Tab><Tab value="plot">Plot</Tab></TabList>
      <TabPanels>
        <TabPanel value="values">
          <div class="actions">
            <div class="column-legend" aria-label="Column type legend"><span><i class="parameter-swatch"></i>Parameters</span><span><i class="metric-swatch"></i>Metrics</span></div>
            <Button label="Export CSV" icon="pi pi-download" size="small" outlined @click="exportCsv" />
          </div>
          <div class="values-grid" :class="{ maximized }">
            <DataTable :value="filteredRows" scrollable scroll-height="flex" filter-display="row" class="values-table" table-style="min-width: 100%">
              <Column v-if="analysis.runCount > 1" field="__software" header="Software" sortable>
                <template #body="slot">{{ slot.data.__software }}</template>
                <template #filter><InputText v-model="columnFilters.__software" aria-label="Filter Software" /></template>
              </Column>
              <Column v-if="analysis.runCount > 1" field="__run_id" header="Run" sortable>
                <template #body="slot">{{ slot.data.__run_id }}</template>
                <template #filter><InputText v-model="columnFilters.__run_id" aria-label="Filter Run" /></template>
              </Column>
              <Column v-for="column in analysis.columns" :key="column.key" :field="column.key" :header="column.label" sortable :header-class="`header-${column.kind}`" :body-class="`cell-${column.kind}`">
                <template #body="slot">{{ slot.data[column.key] ?? '—' }}</template>
                <template #filter><InputText v-model="columnFilters[column.key]" :aria-label="`Filter ${column.label}`" /></template>
              </Column>
              <template #empty>No values match the current filters.</template>
            </DataTable>
          </div>
        </TabPanel>
        <TabPanel value="plot"><ComparisonPlot :data="analysis" :rows="filteredRows" :maximized="maximized" /></TabPanel>
      </TabPanels>
    </Tabs>
  </Dialog>
</template>
