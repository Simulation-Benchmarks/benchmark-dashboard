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

const props = defineProps<{ benchmarks: Benchmark[]; loading: boolean; error: string }>();
const emit = defineEmits<{ select: [benchmark: Benchmark | null] }>();
function benchmarkName(benchmark: Benchmark): string {
  const title = benchmark.benchmark_title.trim();
  const versionSuffix = benchmark.version ? ` (version ${benchmark.version})` : '';
  return (
    (versionSuffix && title.endsWith(versionSuffix)
      ? title.slice(0, -versionSuffix.length)
      : title) ||
    benchmark.benchmark_url ||
    resourceLabel(benchmark.repo)
  );
}
const versionCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const expandedBenchmarks = ref<string[]>([]);
const groupedBenchmarks = computed(() => {
  const groups = new Map<string, Benchmark[]>();
  for (const benchmark of props.benchmarks) {
    const key = benchmarkName(benchmark);
    const rows = groups.get(key) || [];
    rows.push(benchmark);
    groups.set(key, rows);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => ({
      key,
      rows: rows.sort((a, b) => {
        if (!a.version) return b.version ? 1 : 0;
        if (!b.version) return -1;
        return versionCollator.compare(b.version, a.version);
      }),
    }));
});
const selected = ref<Benchmark | null>(null);
const metadataVisible = ref(false);
const metadataLoading = ref(false);
const metadataError = ref('');
const metadataTitle = ref('Benchmark metadata');
const metadata = ref<BenchmarkMetadata | null>(null);
let requestId = 0;

watch(
  groupedBenchmarks,
  (items) => {
    const rows = items.flatMap(({ rows }) => rows);
    selected.value =
      rows.find((item) => item.benchmark_url === selected.value?.benchmark_url) ||
      items[0]?.rows[0] ||
      null;
    emit('select', selected.value);
  },
  { immediate: true },
);

function toggleOlderVersions(key: string): void {
  expandedBenchmarks.value = expandedBenchmarks.value.includes(key)
    ? expandedBenchmarks.value.filter((item) => item !== key)
    : [...expandedBenchmarks.value, key];
}

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
    <p v-if="error && groupedBenchmarks.length" class="grid-error" role="alert">{{ error }}</p>
    <div class="grid-loading-wrapper benchmark-wrapper" :class="{ 'is-loading': loading }">
      <div class="benchmark-list">
        <article v-for="group in groupedBenchmarks" :key="group.key" class="benchmark-card">
          <div class="benchmark-group-content">
            <h3 class="benchmark-group-title">{{ group.key }}</h3>
          </div>
          <DataTable
            v-model:selection="selected"
            :value="expandedBenchmarks.includes(group.key) ? group.rows : group.rows.slice(0, 1)"
            data-key="benchmark_url"
            selection-mode="single"
            class="benchmark-grid"
            @row-select="selectRun($event.data)"
          >
            <Column selection-mode="single" header-style="width: 48px" />
            <Column field="version" header="Benchmark Version" header-style="width: 200px" />
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
          </DataTable>
          <div v-if="group.rows.length > 1" class="benchmark-versions-footer">
            <button
              type="button"
              class="benchmark-versions-toggle"
              :aria-expanded="expandedBenchmarks.includes(group.key)"
              @click="toggleOlderVersions(group.key)"
            >
              {{ expandedBenchmarks.includes(group.key) ? 'Hide' : 'Show' }}
              {{ group.rows.length - 1 }} older
              {{ group.rows.length === 2 ? 'version' : 'versions' }}
              <i
                class="pi"
                :class="
                  expandedBenchmarks.includes(group.key) ? 'pi-chevron-up' : 'pi-chevron-down'
                "
                aria-hidden="true"
              ></i>
            </button>
          </div>
        </article>
        <p v-if="!groupedBenchmarks.length && !loading" class="benchmark-empty">
          <span v-if="error" class="error" role="alert">{{ error }}</span>
          <span v-else>No benchmarks are available.</span>
        </p>
      </div>
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
