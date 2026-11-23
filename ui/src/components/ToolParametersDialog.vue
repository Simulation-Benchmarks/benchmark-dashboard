<script setup lang="ts">
import { ref } from 'vue';
import Dialog from 'primevue/dialog';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import ProgressSpinner from 'primevue/progressspinner';
import { api } from '../lib/api';
import type { Run, ToolParameter } from '../lib/models';

const visible = ref(false);
const loading = ref(false);
const error = ref('');
const items = ref<ToolParameter[]>([]);
const title = ref('Software parameters');
let requestId = 0;

async function open(run: Run): Promise<void> {
  const currentRequest = ++requestId;
  visible.value = true;
  loading.value = true;
  error.value = '';
  items.value = [];
  title.value = `${run.software_name || 'Tool'} ${run.software_version || ''}`.trim();
  try {
    const result = await api.toolParameters(run.run_id);
    if (currentRequest === requestId) items.value = result.items;
  } catch (cause) {
    if (currentRequest === requestId)
      error.value =
        cause instanceof Error ? cause.message : 'Software parameters could not be loaded.';
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
    :style="{ width: 'min(900px, 94vw)' }"
    :content-style="{ height: 'min(520px, 70vh)', overflow: 'hidden' }"
  >
    <template #header
      ><h2>{{ title }} parameters</h2></template
    >
    <div v-if="loading" class="metadata-state">
      <ProgressSpinner aria-label="Loading software parameters" />
    </div>
    <div v-else-if="error" class="metadata-state metadata-error" role="alert">
      {{ error }}
    </div>
    <DataTable
      v-else
      :value="items"
      scrollable
      scroll-height="min(460px, calc(70vh - 3rem))"
      class="metadata-grid parameter-grid"
    >
      <Column field="name" header="Name" />
      <Column field="additional_type" header="Type" />
      <Column field="default_value" header="Default Value" />
      <Column header="Description">
        <template #body="slot">{{ slot.data.description || '—' }}</template>
      </Column>
      <template #empty>No software parameters are available for this run.</template>
    </DataTable>
  </Dialog>
</template>
