<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import ToggleSwitch from 'primevue/toggleswitch';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import ProgressSpinner from 'primevue/progressspinner';
import Dialog from 'primevue/dialog';
import { api } from '../lib/api';
import type { Run, ToolParameter } from '../lib/models';
import { formatPublishedDate, formatPublishedDateTooltip } from '../lib/formatters';

type RunRow = Run & { software_group_key: string };
interface Group {
  name: string;
  url: string | null;
  count: number;
}

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
const toolParametersVisible = ref(false);
const toolParametersLoading = ref(false);
const toolParametersError = ref('');
const toolParameters = ref<ToolParameter[]>([]);
const toolParametersTitle = ref('Software parameters');
let toolParametersRequestId = 0;

async function openToolParameters(run: Run): Promise<void> {
  const requestId = ++toolParametersRequestId;
  toolParametersVisible.value = true;
  toolParametersLoading.value = true;
  toolParametersError.value = '';
  toolParameters.value = [];
  toolParametersTitle.value = `${run.software_name || 'Tool'} ${run.software_version || ''}`.trim();
  try {
    const result = await api.toolParameters(run.run_id);
    if (requestId === toolParametersRequestId) toolParameters.value = result.items;
  } catch (cause) {
    if (requestId === toolParametersRequestId)
      toolParametersError.value =
        cause instanceof Error ? cause.message : 'Software parameters could not be loaded.';
  } finally {
    if (requestId === toolParametersRequestId) toolParametersLoading.value = false;
  }
}
const visibleRuns = computed(() =>
  props.runs.filter((run) => !mainBranchOnly.value || run.branch_url?.endsWith('/tree/main')),
);
const groupedRuns = computed<RunRow[]>(() => {
  const term = search.value.trim().toLocaleLowerCase();
  const bySoftware = new Map<string, RunRow[]>();
  for (const run of visibleRuns.value) {
    if (
      term &&
      ![
        run.software_name,
        run.title,
        run.software_url,
        run.software_version,
        run.branch_url,
        run.datePublished,
      ].some((value) => value?.toLocaleLowerCase().includes(term))
    )
      continue;
    const software_group_key = (
      run.software_name?.trim() || 'Unknown software'
    ).toLocaleLowerCase();
    const group = bySoftware.get(software_group_key) || [];
    group.push({ ...run, software_group_key });
    bySoftware.set(software_group_key, group);
  }
  return [...bySoftware.values()].flat();
});
const emptyMessage = computed(() => {
  if (props.error) return props.error;
  if (props.runs.length) return 'No runs match the current filters.';
  return props.benchmarkSelected
    ? 'This benchmark has no published runs yet.'
    : 'No published runs are available.';
});
const groups = computed(() => {
  const result = new Map<string, Group>();
  for (const run of groupedRuns.value) {
    const group = result.get(run.software_group_key) || {
      name: run.software_name?.trim() || 'Unknown software',
      url: null,
      count: 0,
    };
    group.count++;
    if (run.software_url && (!group.url || run.software_version)) group.url = run.software_url;
    result.set(run.software_group_key, group);
  }
  return result;
});
const canCompare = computed(
  () =>
    selectedRuns.value.length >= 2 &&
    selectedRuns.value.every((run) => run.benchmark_url === selectedRuns.value[0].benchmark_url),
);
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
        resizable-columns
        column-resize-mode="fit"
        class="runs-grid"
        :pt="{ rowGroupHeaderCell: { colspan: 8 } }"
        table-style="min-width: 640px"
        @row-click="openRun"
      >
        <Column selection-mode="multiple" header-style="width: 48px" />
        <Column field="software_version" header="Software Version">
          <template #body="slot">{{ slot.data.software_version || '—' }}</template>
        </Column>
        <Column
          header="Software Parameters"
          header-style="width: 145px"
          header-class="centered-run-column"
          body-class="centered-run-column"
        >
          <template #body="slot">
            <button
              v-if="slot.data.has_tool_parameters"
              class="metadata-button"
              type="button"
              title="View software parameters"
              aria-label="View software parameters"
              @click.stop="openToolParameters(slot.data)"
            >
              <i class="pi pi-info-circle" aria-hidden="true"></i>
            </button>
          </template>
        </Column>
        <Column field="datePublished" header="Publish Date">
          <template #body="slot">
            <span
              class="published-date"
              :title="formatPublishedDateTooltip(slot.data.datePublished)"
            >
              {{ formatPublishedDate(slot.data.datePublished) }}
            </span>
          </template>
        </Column>
        <Column header="Source" header-style="width: 95px">
          <template #body="slot">
            <a
              v-if="slot.data.branch_url"
              class="grid-action source-action"
              :href="slot.data.branch_url"
              target="_blank"
              rel="noopener noreferrer"
              title="Open run GitHub repository"
              aria-label="Open run GitHub repository"
              @click.stop
            >
              <i class="fa-brands fa-github github-icon" aria-hidden="true"></i>
            </a>
          </template>
        </Column>
        <Column header="RoHub" header-style="width: 95px">
          <template #body="slot">
            <a
              class="grid-action rohub-action"
              :href="slot.data.run_id"
              target="_blank"
              rel="noopener noreferrer"
              title="Open run in RoHub"
              @click.stop
            >
              <img class="grid-action-icon" src="/assets/rohub.svg" alt="RoHub" />
            </a>
          </template>
        </Column>
        <Column
          header="Graph"
          header-style="width: 95px"
          header-class="centered-run-column"
          body-class="centered-run-column"
        >
          <template #body="slot">
            <a
              v-if="slot.data.graph"
              class="grid-action graph-action"
              :href="slot.data.graph"
              target="_blank"
              rel="noopener noreferrer"
              :title="slot.data.graph"
              aria-label="Open named graph"
              @click.stop
            >
              <i class="pi pi-share-alt" aria-hidden="true"></i>
            </a>
            <span v-else>—</span>
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
  <Dialog
    v-model:visible="toolParametersVisible"
    modal
    :style="{ width: 'min(900px, 94vw)' }"
    :content-style="{ height: 'min(520px, 70vh)', overflow: 'hidden' }"
  >
    <template #header><h2>{{ toolParametersTitle }} parameters</h2></template>
    <div v-if="toolParametersLoading" class="metadata-state">
      <ProgressSpinner aria-label="Loading software parameters" />
    </div>
    <div v-else-if="toolParametersError" class="metadata-state metadata-error" role="alert">
      {{ toolParametersError }}
    </div>
    <DataTable
      v-else
      :value="toolParameters"
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
