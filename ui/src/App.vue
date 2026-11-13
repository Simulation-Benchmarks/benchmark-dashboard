<script setup lang="ts">
import { onMounted, ref } from 'vue';
import ToggleSwitch from 'primevue/toggleswitch';
import BenchmarkCatalog from './components/BenchmarkCatalog.vue';
import PublishedRuns from './components/PublishedRuns.vue';
import RunAnalysis from './components/RunAnalysis.vue';
import DashboardHelp from './components/DashboardHelp.vue';
import SparqlLog from './components/SparqlLog.vue';
import { useDashboardData } from './composables/useDashboardData';
import { dark, setDark } from './lib/theme';
const {
  benchmarks,
  publishedRuns,
  selectedBenchmarkUrl,
  benchmarkLoading,
  runsLoading,
  benchmarkError,
  runsError,
  updated,
  load,
} = useDashboardData();
const analysis = ref<InstanceType<typeof RunAnalysis> | null>(null);

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
      :refreshing="benchmarkLoading || runsLoading"
      :error="benchmarkError"
      @select="selectedBenchmarkUrl = $event?.benchmark_url || ''"
      @refresh="load(true)"
    />
    <PublishedRuns
      :runs="publishedRuns"
      :loading="runsLoading"
      :error="runsError"
      :benchmark-selected="Boolean(selectedBenchmarkUrl)"
      :updated="updated"
      @analyze="analysis?.open($event)"
    />
  </main>

  <RunAnalysis ref="analysis" />
  <SparqlLog />
</template>
