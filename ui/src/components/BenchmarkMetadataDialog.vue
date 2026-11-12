<script setup lang="ts">
import { ref } from 'vue';
import Dialog from 'primevue/dialog';
import ProgressSpinner from 'primevue/progressspinner';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import { api } from '../lib/api';
import type { Benchmark, BenchmarkMetadata } from '../lib/models';
import MetadataTable from './MetadataTable.vue';

const visible = ref(false);
const loading = ref(false);
const error = ref('');
const title = ref('Benchmark metadata');
const metadata = ref<BenchmarkMetadata | null>(null);
let requestId = 0;

async function open(benchmark: Benchmark): Promise<void> {
  const currentRequest = ++requestId;
  visible.value = true;
  loading.value = true;
  error.value = '';
  metadata.value = null;
  title.value = benchmark.benchmark_title;
  try {
    if (!benchmark.benchmark_url) throw new Error('This benchmark does not have a RoHub URL.');
    const result = await api.benchmarkMetadata(benchmark.benchmark_url);
    if (currentRequest !== requestId) return;
    metadata.value = result;
    title.value = result.benchmark || title.value;
  } catch (cause) {
    if (currentRequest !== requestId) return;
    error.value =
      cause instanceof Error ? cause.message : 'Benchmark metadata could not be loaded.';
  } finally {
    if (currentRequest === requestId) loading.value = false;
  }
}

defineExpose({ open });
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :style="{ width: 'min(760px, 94vw)' }"
    :content-style="{ height: 'min(520px, 70vh)', overflow: 'hidden' }"
  >
    <template #header>
      <div>
        <span class="eyebrow">Benchmark metadata</span>
        <h2>{{ title }}</h2>
      </div>
    </template>
    <div v-if="loading" class="metadata-state">
      <ProgressSpinner aria-label="Loading benchmark metadata" />
    </div>
    <div v-else-if="error" class="metadata-state metadata-error">{{ error }}</div>
    <Tabs v-else-if="metadata" value="parameters">
      <TabList>
        <Tab value="parameters" class="parameter-tab">
          Parameters ({{ metadata.parameters.length }})
        </Tab>
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
