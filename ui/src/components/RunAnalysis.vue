<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
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
const queryVisible = ref(false);
const copiedRunId = ref<string | null>(null);
const collapsedQueries = ref(new Set<string>());
const loading = ref(false);
const error = ref('');
const title = ref('Parameters and metrics');
const tab = ref('values');
const maximized = ref(false);
const analysis = ref<RunAnalysisData | null>(null);
const columnFilters = ref<Record<string, string>>({});
const filteredRows = computed<AnalysisRow[]>(() => {
  if (!analysis.value) return [];
  return analysis.value.rows.filter((row) =>
    Object.entries(columnFilters.value).every(
      ([key, term]) =>
        !term ||
        String(row[key] ?? '')
          .toLocaleLowerCase()
          .includes(term.toLocaleLowerCase()),
    ),
  );
});
const context = computed(() =>
  analysis.value
    ? `${analysis.value.runCount} ${analysis.value.runCount === 1 ? 'run' : 'runs'} · ${filteredRows.value.length} of ${analysis.value.rows.length} observations`
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
    ...(analysis.value.runCount > 1
      ? [
          { key: '__software', label: 'Software' },
          { key: '__software_version', label: 'Software Version' },
          { key: '__run_id', label: 'Run' },
        ]
      : []),
    ...analysis.value.columns,
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
    <Tabs v-else-if="analysis" v-model:value="tab">
      <TabList><Tab value="values">Values</Tab><Tab value="plot">Plot</Tab></TabList>
      <TabPanels>
        <TabPanel value="values">
          <div class="actions">
            <div class="column-legend" aria-label="Column type legend">
              <span><i class="parameter-swatch"></i>Parameters</span
              ><span><i class="metric-swatch"></i>Metrics</span>
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
            <DataTable
              :value="filteredRows"
              scrollable
              scroll-height="flex"
              filter-display="row"
              class="values-table"
              table-style="min-width: 100%"
            >
              <Column v-if="analysis.runCount > 1" field="__software" header="Software" sortable>
                <template #body="slot">{{ slot.data.__software }}</template>
                <template #filter
                  ><InputText v-model="columnFilters.__software" aria-label="Filter Software"
                /></template>
              </Column>
              <Column
                v-if="analysis.runCount > 1"
                field="__software_version"
                header="Software Version"
                sortable
              >
                <template #body="slot">{{ slot.data.__software_version }}</template>
                <template #filter>
                  <InputText
                    v-model="columnFilters.__software_version"
                    aria-label="Filter Version"
                  />
                </template>
              </Column>
              <Column v-if="analysis.runCount > 1" field="__run_id" header="Run" sortable>
                <template #body="slot">{{ slot.data.__run_id }}</template>
                <template #filter
                  ><InputText v-model="columnFilters.__run_id" aria-label="Filter Run"
                /></template>
              </Column>
              <Column
                v-for="column in analysis.columns"
                :key="column.key"
                :field="column.key"
                :header="column.label"
                sortable
                :header-class="`header-${column.kind}`"
                :body-class="`cell-${column.kind}`"
              >
                <template #body="slot">{{ slot.data[column.key] ?? '—' }}</template>
                <template #filter
                  ><InputText
                    v-model="columnFilters[column.key]"
                    :aria-label="`Filter ${column.label}`"
                /></template>
              </Column>
              <template #empty>No values match the current filters.</template>
            </DataTable>
          </div>
        </TabPanel>
        <TabPanel value="plot"
          ><ComparisonPlot :data="analysis" :rows="filteredRows" :maximized="maximized"
        /></TabPanel>
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
