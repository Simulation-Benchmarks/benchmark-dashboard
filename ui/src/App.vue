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
import type { Run } from './lib/models';

const runs = ref<Run[]>([]);
const selectedBenchmarkUrl = ref('');
const publishedRuns = computed(() =>
  runs.value.filter((run) => run.benchmark_url === selectedBenchmarkUrl.value),
);
const loading = ref(true);
const error = ref('');
const updated = ref('');
const analysis = ref<InstanceType<typeof RunAnalysis> | null>(null);

async function load(refresh = false): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    runs.value = (await api.runs(refresh)).items;
    updated.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The runs could not be loaded.';
  } finally {
    loading.value = false;
  }
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
    <div v-if="error" class="state error">{{ error }}</div>
    <template v-else>
      <BenchmarkCatalog
        :runs="runs"
        :loading="loading"
        @select="selectedBenchmarkUrl = $event?.benchmark_url || ''"
      />
      <PublishedRuns
        :runs="publishedRuns"
        :loading="loading"
        :updated="updated"
        @refresh="load(true)"
        @analyze="analysis?.open($event)"
      />
    </template>
  </main>

  <RunAnalysis ref="analysis" />
  <SparqlLog />
</template>
