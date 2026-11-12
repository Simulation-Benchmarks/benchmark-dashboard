<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import ToggleSwitch from 'primevue/toggleswitch';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import ProgressSpinner from 'primevue/progressspinner';
import type { Run } from '../lib/models';
import { formatPublishedDate, formatPublishedDateTooltip } from '../lib/formatters';
import {
  canCompareRuns,
  groupRuns,
  softwareGroups,
  visibleRuns as filterVisibleRuns,
  type RunRow,
} from '../lib/publishedRuns';
import ToolParametersDialog from './ToolParametersDialog.vue';
import GridActionLink from './GridActionLink.vue';

const props = defineProps<{
  runs: Run[];
  loading: boolean;
  error: string;
  benchmarkSelected: boolean;
  updated: string;
}>();
const emit = defineEmits<{ refresh: []; analyze: [runs: Run[]] }>();
const mainBranchOnly = ref(true);
const search = ref('');
const selectedRuns = ref<RunRow[]>([]);
const expandedGroups = ref<string[]>([]);
const toolParametersDialog = ref<InstanceType<typeof ToolParametersDialog> | null>(null);
const visibleRuns = computed(() => filterVisibleRuns(props.runs, mainBranchOnly.value));
const groupedRuns = computed(() => groupRuns(visibleRuns.value, search.value));
const emptyMessage = computed(() => {
  if (props.error) return props.error;
  if (props.runs.length) return 'No runs match the current filters.';
  return props.benchmarkSelected
    ? 'This benchmark has no published runs yet.'
    : 'No published runs are available.';
});
const groups = computed(() => softwareGroups(groupedRuns.value));
const canCompare = computed(() => canCompareRuns(selectedRuns.value));
const compareHint = computed(() =>
  selectedRuns.value.length < 2
    ? 'Select at least two runs to compare'
    : canCompare.value
      ? `Compare ${selectedRuns.value.length} selected runs`
      : 'Select runs from the same benchmark',
);

watch([visibleRuns, search], () => {
  selectedRuns.value = [];
});
watch(
  groups,
  (value) => {
    expandedGroups.value = [...value.keys()];
  },
  { immediate: true },
);

function openRun(event: { data: RunRow; originalEvent: Event }): void {
  const target = event.originalEvent.target as HTMLElement | null;
  if (target?.closest('a, button, input, .p-checkbox')) return;
  emit('analyze', [event.data]);
}
</script>

<template>
  <section class="section-block">
    <div class="section-heading"><h2 class="section-title">Published runs</h2></div>
    <p v-if="error && runs.length" class="grid-error" role="alert">{{ error }}</p>
    <div class="toolbar">
      <span class="search"
        ><i class="pi pi-search"></i
        ><InputText v-model="search" type="search" placeholder="Search ..." aria-label="Search ..."
      /></span>
      <label class="release-filter">
        <ToggleSwitch v-model="mainBranchOnly" aria-label="Latest Release" />
        <span>Latest Release</span>
      </label>
      <span class="compare-trigger"
        ><Button
          label="Compare"
          icon="pi pi-chart-line"
          outlined
          :disabled="!canCompare"
          :title="compareHint"
          @click="emit('analyze', selectedRuns)"
      /></span>
      <Button
        label="Reload"
        icon="pi pi-refresh"
        class="reload-button"
        :loading="loading"
        @click="emit('refresh')"
      />
    </div>
    <div class="summary">
      <span>Updated {{ updated }}</span>
    </div>
    <div class="grid-loading-wrapper runs-wrapper">
      <DataTable
        v-model:selection="selectedRuns"
        v-model:expandedRowGroups="expandedGroups"
        :value="groupedRuns"
        data-key="run_id"
        row-group-mode="subheader"
        group-rows-by="software_group_key"
        expandable-row-groups
        class="runs-grid"
        :pt="{ rowGroupHeaderCell: { colspan: 5 } }"
        table-style="min-width: 760px"
        @row-click="openRun"
      >
        <Column selection-mode="multiple" header-style="width: 48px" />
        <Column
          field="software_version"
          header="Version"
          header-class="version-column"
          body-class="version-column"
        >
          <template #body="slot">{{ slot.data.software_version || '—' }}</template>
        </Column>
        <Column
          field="datePublished"
          header="Publish Date"
          header-class="publish-date-column"
          body-class="publish-date-column"
        >
          <template #body="slot">
            <span
              class="published-date"
              :title="formatPublishedDateTooltip(slot.data.datePublished)"
            >
              {{ formatPublishedDate(slot.data.datePublished) }}
            </span>
          </template>
        </Column>
        <Column
          field="description"
          header="Description"
          header-class="description-column"
          body-class="description-column"
        >
          <template #body="slot">{{ slot.data.description || '—' }}</template>
        </Column>
        <Column header-class="action-column" body-class="action-column">
          <template #body="slot">
            <div class="grid-actions">
              <GridActionLink
                v-if="slot.data.branch_url"
                class="source-action"
                :href="slot.data.branch_url"
                title="Open run GitHub repository"
              >
                <i class="fa-brands fa-github github-icon" aria-hidden="true"></i>
              </GridActionLink>
              <GridActionLink
                class="rohub-action"
                :href="slot.data.run_id"
                title="Open run in RoHub"
              >
                <img class="grid-action-icon" src="/assets/rohub.svg" alt="" />
              </GridActionLink>
              <GridActionLink
                v-if="slot.data.graph"
                class="graph-action"
                :href="slot.data.graph"
                :title="`Open named graph: ${slot.data.graph}`"
                aria-label="Open named graph"
              >
                <i class="pi pi-share-alt" aria-hidden="true"></i>
              </GridActionLink>

              <button
                class="grid-icon-button"
                type="button"
                title="Open run dialog"
                aria-label="Open run dialog"
                @click.stop="emit('analyze', [slot.data])"
              >
                <i class="pi pi-chart-line" aria-hidden="true"></i>
              </button>
              <button
                v-if="slot.data.has_tool_parameters"
                class="grid-icon-button"
                type="button"
                title="View software parameters"
                aria-label="View software parameters"
                @click.stop="toolParametersDialog?.open(slot.data)"
              >
                <i class="pi pi-cog" aria-hidden="true"></i>
              </button>
            </div>
          </template>
        </Column>
        <template #groupheader="slot">
          <div class="software-group-content">
            <a
              v-if="groups.get(slot.data.software_group_key)?.url"
              :href="groups.get(slot.data.software_group_key)?.url || undefined"
              target="_blank"
              rel="noopener noreferrer"
              @click.stop
              >{{ groups.get(slot.data.software_group_key)?.name }}</a
            >
            <span v-else>{{ groups.get(slot.data.software_group_key)?.name }}</span>
            <span class="software-group-count"
              >{{ groups.get(slot.data.software_group_key)?.count }}
              {{ groups.get(slot.data.software_group_key)?.count === 1 ? 'run' : 'runs' }}</span
            >
          </div>
        </template>
        <template #empty>
          <span :class="{ error }" :role="error ? 'alert' : undefined">{{ emptyMessage }}</span>
        </template>
      </DataTable>
      <div v-if="loading" class="grid-loading-overlay">
        <ProgressSpinner aria-label="Loading published runs" />
      </div>
    </div>
  </section>
  <ToolParametersDialog ref="toolParametersDialog" />
</template>
