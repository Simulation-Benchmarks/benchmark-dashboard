<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, ref } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import ProgressSpinner from 'primevue/progressspinner';
import type { Run } from '../lib/models';
import type { AnalysisRow, RunAnalysisData } from '../lib/analysis';
import { loadAnalysis } from '../lib/analysis';
import type { SheetSnapshot } from './ValuesSpreadsheet.vue';
import ComparisonPlot from './ComparisonPlot.vue';
const ValuesSpreadsheet = defineAsyncComponent(() => import('./ValuesSpreadsheet.vue'));

const visible = ref(false);
const queryVisible = ref(false);
const copiedRunId = ref<string | null>(null);
const collapsedQueries = ref(new Set<string>());
const loading = ref(false);
const error = ref('');
const title = ref('Parameters and metrics');
const tab = ref('values');
const maximized = ref(false);
const analysis = ref<RunAnalysisData | null>(null);
const sheetSnapshot = ref<SheetSnapshot | null>(null);
const displayColumns = computed(
  () => sheetSnapshot.value?.columns || analysis.value?.columns || [],
);
const filteredRows = computed<AnalysisRow[]>(
  () => sheetSnapshot.value?.visibleRows || analysis.value?.rows || [],
);
const plotData = computed<RunAnalysisData | null>(() =>
  analysis.value ? { ...analysis.value, columns: displayColumns.value } : null,
);
const context = computed(() =>
  analysis.value
    ? `${analysis.value.runCount} ${analysis.value.runCount === 1 ? 'run' : 'runs'} · ${filteredRows.value.length} of ${sheetSnapshot.value?.rows.length ?? analysis.value.rows.length} observations`
    : '',
);
const runLabels = computed(
  () =>
    analysis.value?.runDetails.map(
      ({ softwareName, softwareVersion }) =>
        `${softwareName} · ${softwareVersion ? `Version ${softwareVersion}` : 'Version unavailable'}`,
    ) || [],
);
let requestId = 0;
let copyTimer: number | undefined;

function resetCopiedQuery(): void {
  window.clearTimeout(copyTimer);
  copyTimer = undefined;
  copiedRunId.value = null;
}

function toggleQuery(runId: string): void {
  const next = new Set(collapsedQueries.value);
  if (next.has(runId)) next.delete(runId);
  else next.add(runId);
  collapsedQueries.value = next;
}

async function copyQuery(runId: string, query: string): Promise<void> {
  await navigator.clipboard.writeText(query);
  resetCopiedQuery();
  copiedRunId.value = runId;
  copyTimer = window.setTimeout(resetCopiedQuery, 1600);
}

onBeforeUnmount(resetCopiedQuery);

async function open(runs: Run[]): Promise<void> {
  if (!runs.length) return;
  const current = ++requestId;
  visible.value = true;
  queryVisible.value = false;
  resetCopiedQuery();
  collapsedQueries.value = new Set();
  loading.value = true;
  error.value = '';
  analysis.value = null;
  sheetSnapshot.value = null;
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

function updateSheet(snapshot: SheetSnapshot): void {
  sheetSnapshot.value = snapshot;
}

function exportCsv(): void {
  if (!analysis.value) return;
  const columns = [
    ...(analysis.value.runCount > 1
      ? [
          { key: '__software', label: 'Software' },
          { key: '__software_version', label: 'Software Version' },
          { key: '__run_id', label: 'Run' },
        ]
      : []),
    ...displayColumns.value,
  ];
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [
    columns.map((column) => escape(column.label)).join(','),
    ...filteredRows.value.map((row) => columns.map((column) => escape(row[column.key])).join(',')),
  ].join('\r\n');
  const name = (analysis.value.payload.benchmark || 'benchmark-values')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
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
  <Dialog
    v-model:visible="visible"
    modal
    maximizable
    :style="{ width: 'min(1120px, 96vw)' }"
    :content-style="{ height: 'min(680px, 76vh)' }"
    @maximize="maximized = true"
    @unmaximize="maximized = false"
    @hide="queryVisible = false"
  >
    <template #header
      ><div>
        <span class="eyebrow">Run values</span>
        <h2>{{ title }}</h2>
        <small>{{ context }}</small>
        <div v-if="analysis" class="analysis-run-labels">
          <span v-for="(label, index) in runLabels" :key="index">{{ label }}</span>
        </div>
      </div></template
    >
    <div v-if="loading" class="analysis-state">
      <ProgressSpinner aria-label="Loading run values" />
      <p>Running SPARQL queries…</p>
    </div>
    <p v-else-if="error" class="analysis-state error">{{ error }}</p>
    <Tabs
      v-else-if="analysis"
      v-model:value="tab"
      :class="{ 'analysis-values-tabs': tab === 'values' }"
    >
      <TabList><Tab value="values">Values</Tab><Tab value="plot">Plot</Tab></TabList>
      <TabPanels>
        <TabPanel value="values" class="analysis-values-panel">
          <div class="actions">
            <div class="spreadsheet-legend" aria-label="Column colors">
              <span class="spreadsheet-legend-item parameter"
                ><span class="spreadsheet-legend-swatch"></span>Parameters</span
              >
              <span class="spreadsheet-legend-item metric"
                ><span class="spreadsheet-legend-swatch"></span>Metrics</span
              >
            </div>
            <div class="value-actions">
              <Button
                label="SPARQL query"
                icon="pi pi-code"
                size="small"
                outlined
                @click="queryVisible = true"
              />
              <Button
                label="Export CSV"
                icon="pi pi-download"
                size="small"
                outlined
                @click="exportCsv"
              />
            </div>
          </div>
          <div class="values-grid" :class="{ maximized }">
            <ValuesSpreadsheet :data="analysis" @change="updateSheet" />
          </div>
        </TabPanel>
        <TabPanel value="plot">
          <ComparisonPlot
            v-if="plotData"
            :data="plotData"
            :rows="filteredRows"
            :maximized="maximized"
          />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </Dialog>

  <Dialog
    v-model:visible="queryVisible"
    modal
    maximizable
    :style="{ width: 'min(960px, 94vw)' }"
    :content-style="{ maxHeight: '70vh', overflow: 'auto' }"
    @hide="resetCopiedQuery"
  >
    <template #header>
      <h2>{{ analysis?.runCount === 1 ? 'SPARQL query' : 'SPARQL queries' }}</h2>
    </template>
    <p class="endpoint-notice">
      Run copied queries directly on the RoHub SPARQL endpoint:
      <a
        href="https://virtuoso-rohub2020-production.apps.bst2.paas.psnc.pl/sparql"
        target="_blank"
        rel="noopener noreferrer"
        >virtuoso-rohub2020-production.apps.bst2.paas.psnc.pl/sparql</a
      >
    </p>
    <div class="run-query-list">
      <section
        v-for="(detail, index) in analysis?.runDetails || []"
        :key="detail.runId"
        class="run-query-item"
      >
        <div class="run-query-heading">
          <div>
            <h3>
              {{ detail.softwareName }} · {{ detail.softwareVersion || 'Version unavailable' }}
            </h3>
            <small>{{ detail.runId }}</small>
          </div>
          <div v-if="detail.query" class="log-actions">
            <button
              class="log-action"
              type="button"
              :aria-label="copiedRunId === detail.runId ? 'Query copied' : 'Copy query'"
              :title="copiedRunId === detail.runId ? 'Query copied' : 'Copy query'"
              @click="copyQuery(detail.runId, detail.query)"
            >
              <i class="pi" :class="copiedRunId === detail.runId ? 'pi-check' : 'pi-copy'"></i>
            </button>
            <button
              class="log-action"
              type="button"
              :aria-expanded="!collapsedQueries.has(detail.runId)"
              :aria-controls="`run-query-${index}`"
              :aria-label="collapsedQueries.has(detail.runId) ? 'Expand query' : 'Collapse query'"
              @click="toggleQuery(detail.runId)"
            >
              <i
                class="pi"
                :class="collapsedQueries.has(detail.runId) ? 'pi-chevron-down' : 'pi-chevron-up'"
              ></i>
            </button>
          </div>
        </div>
        <pre
          v-if="detail.query && !collapsedQueries.has(detail.runId)"
          :id="`run-query-${index}`"
          >{{ detail.query }}</pre>
        <p v-if="!detail.query">Query unavailable.</p>
      </section>
    </div>
  </Dialog>
</template>
