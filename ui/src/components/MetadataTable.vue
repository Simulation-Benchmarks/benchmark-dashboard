<script setup lang="ts">
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import { resourceLabel } from '../lib/formatters';
import type { BenchmarkVariable } from '../lib/models';

defineProps<{
  items: BenchmarkVariable[];
  kind: 'parameter' | 'metric';
}>();
</script>

<template>
  <DataTable :value="items" :class="['metadata-grid', `${kind}-grid`]">
    <Column field="name" header="Name" />
    <Column header="Unit">
      <template #body="slot">
        <a
          v-if="slot.data.unit"
          :href="slot.data.unit"
          :title="slot.data.unit"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ resourceLabel(slot.data.unit) }}
        </a>
        <span v-else>—</span>
      </template>
    </Column>
  </DataTable>
</template>
