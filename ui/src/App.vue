<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import ToggleSwitch from 'primevue/toggleswitch';
import BenchmarkCatalog from './components/BenchmarkCatalog.vue';
import PublishedRuns from './components/PublishedRuns.vue';
import RunAnalysis from './components/RunAnalysis.vue';
import DashboardHelp from './components/DashboardHelp.vue';
import SparqlLog from './components/SparqlLog.vue';
import { api } from './lib/api';
import { dark, setDark } from './lib/theme';
import type { Benchmark, Run } from './lib/models';

const benchmarks = ref<Benchmark[]>([]);
const runs = ref<Run[]>([]);
const selectedBenchmarkUrl = ref('');
const publishedRuns = computed(() =>
  selectedBenchmarkUrl.value
    ? runs.value.filter((run) => run.benchmark_url === selectedBenchmarkUrl.value)
    : runs.value,
);
const benchmarkLoading = ref(true);
const runsLoading = ref(true);
const benchmarkError = ref('');
const runsError = ref('');
const updated = ref('');
const analysis = ref<InstanceType<typeof RunAnalysis> | null>(null);
let requestId = 0;

async function load(refresh = false): Promise<void> {
  const currentRequest = ++requestId;
  benchmarkLoading.value = true;
  runsLoading.value = true;
  benchmarkError.value = '';
  runsError.value = '';

  await Promise.all([
    api
      .benchmarks(refresh)
      .then((response) => {
        if (currentRequest === requestId) benchmarks.value = response.items;
      })
      .catch((cause) => {
        if (currentRequest === requestId)
          benchmarkError.value =
            cause instanceof Error ? cause.message : 'Benchmarks could not be loaded.';
      })
      .finally(() => {
        if (currentRequest === requestId) benchmarkLoading.value = false;
      }),
    api
      .runs(refresh)
      .then((response) => {
        if (currentRequest !== requestId) return;
        runs.value = response.items;
        updated.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      })
      .catch((cause) => {
        if (currentRequest === requestId)
          runsError.value = cause instanceof Error ? cause.message : 'Runs could not be loaded.';
      })
      .finally(() => {
        if (currentRequest === requestId) runsLoading.value = false;
      }),
  ]);
}

onMounted(() => void load());
</script>

<template>
  <header class="hero">
    <a class="brand-link" href="https://nfdi4ing.de/" aria-label="Visit the NFDI4ING website">
      <img class="brand-wordmark" src="/assets/nfdi4ing.svg" alt="NFDI4ING" />
    </a>
    <div class="ribbon-actions">
      <DashboardHelp />
      <label class="theme-switch">
        <i class="pi" :class="dark ? 'pi-moon' : 'pi-sun'" aria-hidden="true"></i>
        <ToggleSwitch
          :model-value="dark"
          aria-label="Toggle dark theme"
          @update:model-value="setDark(Boolean($event))"
        />
      </label>
    </div>
  </header>

  <main>
    <BenchmarkCatalog
      :benchmarks="benchmarks"
      :loading="benchmarkLoading"
      :error="benchmarkError"
      @select="selectedBenchmarkUrl = $event?.benchmark_url || ''"
    />
    <PublishedRuns
      :runs="publishedRuns"
      :loading="runsLoading"
      :error="runsError"
      :benchmark-selected="Boolean(selectedBenchmarkUrl)"
      :updated="updated"
      @refresh="load(true)"
      @analyze="analysis?.open($event)"
    />
  </main>

  <RunAnalysis ref="analysis" />
  <SparqlLog />
</template>
