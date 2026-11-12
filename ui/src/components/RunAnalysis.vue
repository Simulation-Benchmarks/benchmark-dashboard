<script setup lang="ts">
import { computed, defineAsyncComponent, ref } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import ProgressSpinner from 'primevue/progressspinner';
import type { Run } from '../lib/models';
import type { AnalysisRow, RunAnalysisData, SheetSnapshot } from '../lib/analysis';
import { loadAnalysis } from '../lib/analysis';
import { exportAnalysisCsv } from '../lib/exportCsv';
import ComparisonPlot from './ComparisonPlot.vue';
import RunQueriesDialog from './RunQueriesDialog.vue';
const ValuesSpreadsheet = defineAsyncComponent(() => import('./ValuesSpreadsheet.vue'));

const visible = ref(false);
const queryVisible = ref(false);
const queriesDialog = ref<InstanceType<typeof RunQueriesDialog> | null>(null);
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
async function open(runs: Run[]): Promise<void> {
  if (!runs.length) return;
  const current = ++requestId;
  visible.value = true;
  queryVisible.value = false;
  queriesDialog.value?.reset();
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
    title.value = result.benchmark;
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
  exportAnalysisCsv(analysis.value, displayColumns.value, filteredRows.value);
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

  <RunQueriesDialog ref="queriesDialog" v-model:visible="queryVisible" :analysis="analysis" />
</template>
