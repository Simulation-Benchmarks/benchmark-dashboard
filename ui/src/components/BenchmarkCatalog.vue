<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Dialog from 'primevue/dialog';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import ProgressSpinner from 'primevue/progressspinner';
import { siJupyter } from 'simple-icons';
import { api } from '../lib/api';
import { repositoryUrl, resourceLabel } from '../lib/formatters';
import type { Benchmark, BenchmarkMetadata } from '../lib/models';
import MetadataTable from './MetadataTable.vue';

type BenchmarkRow = Benchmark & { benchmark_group_key: string };

const props = defineProps<{ benchmarks: Benchmark[]; loading: boolean }>();
const emit = defineEmits<{ select: [benchmark: Benchmark | null] }>();
function benchmarkName(benchmark: Benchmark): string {
  const title = benchmark.benchmark_title.trim();
  const versionSuffix = benchmark.version ? ` (version ${benchmark.version})` : '';
  return (
    (versionSuffix && title.endsWith(versionSuffix)
      ? title.slice(0, -versionSuffix.length)
      : title) || resourceLabel(benchmark.repo)
  );
}
const benchmarks = computed<BenchmarkRow[]>(() =>
  props.benchmarks.map((benchmark) => ({
    ...benchmark,
    benchmark_group_key: benchmarkName(benchmark),
  })),
);
const expandedBenchmarks = ref<string[]>([]);
const benchmarkGroups = computed(() => {
  const result = new Map<string, number>();
  for (const benchmark of benchmarks.value) {
    const key = benchmark.benchmark_group_key;
    result.set(key, (result.get(key) || 0) + 1);
  }
  return result;
});
const selected = ref<Benchmark | null>(null);
const metadataVisible = ref(false);
const metadataLoading = ref(false);
const metadataError = ref('');
const metadataTitle = ref('Benchmark metadata');
const metadata = ref<BenchmarkMetadata | null>(null);
let requestId = 0;

watch(
  benchmarks,
  (items) => {
    selected.value =
      items.find((item) => item.benchmark_url === selected.value?.benchmark_url) ||
      items[0] ||
      null;
    emit('select', selected.value);
  },
  { immediate: true },
);
watch(
  benchmarkGroups,
  (groups) => {
    expandedBenchmarks.value = [...groups.keys()];
  },
  { immediate: true },
);

function selectRun(benchmark: Benchmark): void {
  selected.value = benchmark;
  emit('select', benchmark);
}

async function openMetadata(run: Benchmark): Promise<void> {
  const currentRequest = ++requestId;
  metadataVisible.value = true;
  metadataLoading.value = true;
  metadataError.value = '';
  metadata.value = null;
  metadataTitle.value = run.benchmark_title;
  try {
    if (!run.benchmark_url) throw new Error('This benchmark does not have a RoHub URL.');
    const result = await api.benchmarkMetadata(run.benchmark_url);
    if (currentRequest !== requestId) return;
    metadata.value = result;
    metadataTitle.value = result.benchmark || metadataTitle.value;
  } catch (cause) {
    if (currentRequest !== requestId) return;
    metadataError.value =
      cause instanceof Error ? cause.message : 'Benchmark metadata could not be loaded.';
  } finally {
    if (currentRequest === requestId) metadataLoading.value = false;
  }
}

function jupyterUrl(repository: string | null): string | null {
  const name = repository
    ?.replace(/\/$/, '')
    .split('/')
    .at(-1)
    ?.replace(/\.git$/, '');
  return name
    ? `https://hub.nfdi-jupyter.de/v2/gh/Simulation-Benchmarks/${encodeURIComponent(name)}/HEAD`
    : null;
}
</script>

<template>
  <section class="section-block">
    <div class="section-heading"><h2 class="section-title">Benchmarks</h2></div>
    <div class="grid-loading-wrapper benchmark-wrapper" :class="{ 'is-loading': loading }">
      <DataTable
        v-model:selection="selected"
        v-model:expandedRowGroups="expandedBenchmarks"
        :value="benchmarks"
        data-key="benchmark_url"
        selection-mode="single"
        row-group-mode="subheader"
        group-rows-by="benchmark_group_key"
        expandable-row-groups
        class="benchmark-grid"
        :pt="{ rowGroupHeaderCell: { colspan: 7 } }"
        @row-select="selectRun($event.data)"
      >
        <Column selection-mode="single" header-style="width: 48px" />
        <Column field="version" header="Version" header-style="width: 140px" />
        <Column header="Metadata" header-style="width: 110px">
          <template #body="slot">
            <button
              class="metadata-button"
              type="button"
              title="View parameters and metrics"
              aria-label="View parameters and metrics"
              @click.stop="openMetadata(slot.data)"
            >
              <i class="pi pi-info-circle" aria-hidden="true"></i>
            </button>
          </template>
        </Column>
        <Column header="Research problem" header-style="width: 150px">
          <template #body="slot">
            <a
              v-if="slot.data.research_problem_uri"
              class="grid-action research-problem-action"
              :href="slot.data.research_problem_uri"
              target="_blank"
              rel="noopener noreferrer"
              title="Open research problem"
              aria-label="Open research problem"
              @click.stop
            >
              <i class="fa-regular fa-pencil" aria-hidden="true"></i>
            </a>
          </template>
        </Column>
        <Column header="Source" header-style="width: 95px">
          <template #body="slot">
            <a
              v-if="repositoryUrl(slot.data.repo)"
              class="grid-action source-action"
              :href="repositoryUrl(slot.data.repo) || undefined"
              target="_blank"
              rel="noopener noreferrer"
              title="Open GitHub repository"
              aria-label="Open GitHub repository"
              @click.stop
            >
              <i class="fa-brands fa-github github-icon" aria-hidden="true"></i>
            </a>
          </template>
        </Column>
        <Column header="RoHub" header-style="width: 95px">
          <template #body="slot">
            <a
              v-if="slot.data.benchmark_url"
              class="grid-action rohub-action"
              :href="slot.data.benchmark_url"
              target="_blank"
              rel="noopener noreferrer"
              title="Open benchmark in RoHub"
              @click.stop
            >
              <img class="grid-action-icon" src="/assets/rohub.svg" alt="RoHub" />
            </a>
          </template>
        </Column>
        <Column header="Notebook" header-style="width: 100px">
          <template #body="slot">
            <a
              v-if="jupyterUrl(repositoryUrl(slot.data.repo))"
              class="grid-action notebook-action"
              :href="jupyterUrl(repositoryUrl(slot.data.repo)) || undefined"
              target="_blank"
              rel="noopener noreferrer"
              title="Open repository in Jupyter Notebook"
              aria-label="Open repository in Jupyter Notebook"
              @click.stop
            >
              <svg
                class="grid-action-icon"
                viewBox="0 0 24 24"
                :fill="`#${siJupyter.hex}`"
                aria-hidden="true"
              >
                <path :d="siJupyter.path" />
              </svg>
            </a>
          </template>
        </Column>
        <template #groupheader="slot">
          <div class="benchmark-group-content">
            <span>{{ slot.data.benchmark_group_key }}</span>
            <span class="benchmark-group-count">
              {{ benchmarkGroups.get(slot.data.benchmark_group_key) }}
              {{
                benchmarkGroups.get(slot.data.benchmark_group_key) === 1 ? 'version' : 'versions'
              }}
            </span>
          </div>
        </template>
      </DataTable>
      <div v-if="loading" class="grid-loading-overlay">
        <ProgressSpinner aria-label="Loading benchmarks" />
      </div>
    </div>
  </section>

  <Dialog
    v-model:visible="metadataVisible"
    modal
    :style="{ width: 'min(760px, 94vw)' }"
    :content-style="{ height: 'min(520px, 70vh)', overflow: 'auto' }"
  >
    <template #header
      ><div>
        <span class="eyebrow">Benchmark metadata</span>
        <h2>{{ metadataTitle }}</h2>
      </div></template
    >
    <div v-if="metadataLoading" class="metadata-state">
      <ProgressSpinner aria-label="Loading benchmark metadata" />
    </div>
    <div v-else-if="metadataError" class="metadata-state metadata-error">{{ metadataError }}</div>
    <Tabs v-else-if="metadata" value="parameters">
      <TabList>
        <Tab value="parameters" class="parameter-tab"
          >Parameters ({{ metadata.parameters.length }})</Tab
        >
        <Tab value="metrics" class="metric-tab">Metrics ({{ metadata.metrics.length }})</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="parameters">
          <MetadataTable :items="metadata.parameters" kind="parameter" />
        </TabPanel>
        <TabPanel value="metrics">
          <MetadataTable :items="metadata.metrics" kind="metric" />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </Dialog>
</template>
