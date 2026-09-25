<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import DataTable from 'primevue/datatable';
import type { DataTableSortEvent } from 'primevue/datatable';
import Column from 'primevue/column';
import ProgressSpinner from 'primevue/progressspinner';
import type { Run } from '../lib/models';
import { formatPublishedDate, formatPublishedDateTooltip } from '../lib/formatters';

type RunRow = Run & { software_group_key: string };
interface Group { name: string; url: string | null; count: number }

const props = defineProps<{ runs: Run[]; loading: boolean; updated: string }>();
const emit = defineEmits<{ refresh: []; analyze: [runs: Run[]] }>();
const mainBranchOnly = ref(true);
const search = ref('');
const selectedRuns = ref<RunRow[]>([]);
const expandedGroups = ref<string[]>([]);
const tableContainer = ref<HTMLElement | null>(null);
const sortField = ref<'software_version' | 'datePublished'>('datePublished');
const sortOrder = ref<1 | -1>(-1);
const visibleRuns = computed(() => props.runs.filter((run) => run.graph_valid && (!mainBranchOnly.value || run.branch_url?.endsWith('/tree/main'))));
const groupedRuns = computed<RunRow[]>(() => {
  const term = search.value.trim().toLocaleLowerCase();
  return visibleRuns.value
    .filter((run) => !term || [run.software_name, run.software_url, run.software_version, run.benchmark_repo, run.branch_url, run.datePublished]
      .some((value) => value?.toLocaleLowerCase().includes(term)))
    .map((run) => ({ ...run, software_group_key: (run.software_name?.trim() || 'Unknown software').toLocaleLowerCase() }))
    .sort((a, b) => {
      const groupOrder = a.software_group_key.localeCompare(b.software_group_key);
      if (groupOrder) return groupOrder;
      if (sortField.value === 'software_version') {
        return sortOrder.value * (a.software_version || '').localeCompare(b.software_version || '', undefined, { numeric: true });
      }
      return sortOrder.value * ((Date.parse(a.datePublished || '') || 0) - (Date.parse(b.datePublished || '') || 0));
    });
});
function sortRuns(event: DataTableSortEvent): void {
  if (event.sortField === 'software_version' || event.sortField === 'datePublished') {
    sortField.value = event.sortField;
    sortOrder.value = event.sortOrder === -1 ? -1 : 1;
  }
}
const groups = computed(() => {
  const result = new Map<string, Group>();
  for (const run of groupedRuns.value) {
    const group = result.get(run.software_group_key) || { name: run.software_name?.trim() || 'Unknown software', url: null, count: 0 };
    group.count++;
    if (run.software_url && (!group.url || run.software_version)) group.url = run.software_url;
    result.set(run.software_group_key, group);
  }
  return result;
});
const canCompare = computed(() => selectedRuns.value.length >= 2 && selectedRuns.value.every((run) => run.benchmark_url === selectedRuns.value[0].benchmark_url));
const compareHint = computed(() => selectedRuns.value.length < 2 ? 'Select at least two runs to compare' : canCompare.value ? `Compare ${selectedRuns.value.length} selected runs` : 'Select runs from the same benchmark');

watch(visibleRuns, () => { selectedRuns.value = []; });
watch(groups, (value) => { expandedGroups.value = [...value.keys()]; }, { immediate: true });

function openRun(event: { data: RunRow; originalEvent: Event }): void {
  const target = event.originalEvent.target as HTMLElement | null;
  if (target?.closest('a, button, input, .p-checkbox')) return;
  emit('analyze', [event.data]);
}

function animateGroupToggle(event: MouseEvent): void {
  if (!(event.target as HTMLElement).closest('.p-datatable-row-toggle-button') ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const body = tableContainer.value?.querySelector('.p-datatable-tbody');
  if (!body) return;
  const before = new Map(Array.from(body.children, (row) => [row, row.getBoundingClientRect().top]));

  // PrimeVue updates the rows after its click handler; animate their new positions on the next frame.
  requestAnimationFrame(() => {
    if (!body.isConnected) return;
    for (const row of Array.from(body.children)) {
      if (!(row instanceof HTMLElement)) continue;
      const previousTop = before.get(row);
      if (previousTop === undefined) {
        row.animate([{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 220, easing: 'ease-out' });
      } else {
        const shift = previousTop - row.getBoundingClientRect().top;
        if (Math.abs(shift) > 1) {
          row.animate([{ transform: `translateY(${shift}px)` }, { transform: 'translateY(0)' }],
            { duration: 240, easing: 'ease-in-out' });
        }
      }
    }
  });
}
</script>

<template>
  <section class="section-block">
    <div class="section-heading"><h2 class="section-title">Published runs</h2></div>
    <div class="toolbar">
      <span class="search"><i class="pi pi-search"></i><InputText v-model="search" type="search" placeholder="Search software or repository…" aria-label="Search software or repository" /></span>
      <select v-model="mainBranchOnly" class="branch-filter" aria-label="Filter runs by branch">
        <option :value="false">All runs</option><option :value="true">Main branch</option>
      </select>
      <span class="compare-trigger"><Button label="Compare" icon="pi pi-chart-line" outlined :disabled="!canCompare" :title="compareHint" @click="emit('analyze', selectedRuns)" /></span>
      <Button label="Reload" icon="pi pi-refresh" class="reload-button" :loading="loading" @click="emit('refresh')" />
    </div>
    <div class="summary"><span>Updated {{ updated }}</span></div>
    <div ref="tableContainer" class="grid-loading-wrapper" @click.capture="animateGroupToggle">
      <DataTable
        v-model:selection="selectedRuns"
        v-model:expandedRowGroups="expandedGroups"
        :value="groupedRuns"
        lazy
        :sort-field="sortField"
        :sort-order="sortOrder"
        data-key="run_id"
        row-group-mode="subheader"
        group-rows-by="software_group_key"
        expandable-row-groups
        class="runs-grid"
        :pt="{ rowGroupHeaderCell: { colspan: 6 } }"
        table-style="min-width: 640px"
        @row-click="openRun"
        @sort="sortRuns"
      >
        <Column selection-mode="multiple" header-style="width: 48px" />
        <Column field="software_version" header="Software Version" sortable>
          <template #body="slot">{{ slot.data.software_version || '—' }}</template>
        </Column>
        <Column field="datePublished" header="Publish Date" sortable>
          <template #body="slot">
            <span class="published-date" :title="formatPublishedDateTooltip(slot.data.datePublished)">
              {{ formatPublishedDate(slot.data.datePublished) }}
            </span>
          </template>
        </Column>
        <Column header="Source" header-style="width: 95px">
          <template #body="slot">
            <a v-if="slot.data.branch_url" class="grid-action source-action" :href="slot.data.branch_url" target="_blank" rel="noopener noreferrer" title="Open run GitHub repository" aria-label="Open run GitHub repository" @click.stop>
              <i class="fa-brands fa-github github-icon" aria-hidden="true"></i>
            </a>
          </template>
        </Column>
        <Column header="RoHub" header-style="width: 95px">
          <template #body="slot">
            <a class="grid-action rohub-action" :href="slot.data.run_id" target="_blank" rel="noopener noreferrer" title="Open run in RoHub" @click.stop>
              <img class="grid-action-icon" src="/assets/rohub.svg" alt="RoHub" />
            </a>
          </template>
        </Column>
        <Column header="Graph" header-style="width: 95px">
          <template #body="slot">
            <a v-if="slot.data.graph" class="grid-action graph-action" :href="slot.data.graph" target="_blank" rel="noopener noreferrer" :title="slot.data.graph" aria-label="Open named graph" @click.stop>
              <i class="pi pi-share-alt" aria-hidden="true"></i>
            </a>
            <span v-else>—</span>
          </template>
        </Column>
        <template #groupheader="slot">
          <div class="software-group-content">
            <a v-if="groups.get(slot.data.software_group_key)?.url" :href="groups.get(slot.data.software_group_key)?.url || undefined" target="_blank" rel="noopener noreferrer" @click.stop>{{ groups.get(slot.data.software_group_key)?.name }}</a>
            <span v-else>{{ groups.get(slot.data.software_group_key)?.name }}</span>
            <span class="software-group-count">{{ groups.get(slot.data.software_group_key)?.count }} {{ groups.get(slot.data.software_group_key)?.count === 1 ? 'run' : 'runs' }}</span>
          </div>
        </template>
        <template #empty>No published runs match the current filters.</template>
      </DataTable>
      <div v-if="loading" class="grid-loading-overlay"><ProgressSpinner aria-label="Loading published runs" /></div>
    </div>
  </section>
</template>
