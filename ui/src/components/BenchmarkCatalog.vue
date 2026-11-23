<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';
import { siJupyter } from 'simple-icons';
import { filterBenchmarks, groupBenchmarks, jupyterUrl } from '../lib/catalog';
import { repositoryUrl } from '../lib/formatters';
import type { Benchmark } from '../lib/models';
import BenchmarkMetadataDialog from './BenchmarkMetadataDialog.vue';
import GridActionLink from './GridActionLink.vue';

const props = defineProps<{
  benchmarks: Benchmark[];
  loading: boolean;
  refreshing: boolean;
  error: string;
}>();
const emit = defineEmits<{ select: [benchmark: Benchmark | null]; refresh: [] }>();
const search = ref('');
const expandedBenchmarks = ref<string[]>([]);
const groupedBenchmarks = computed(() =>
  groupBenchmarks(filterBenchmarks(props.benchmarks, search.value)),
);
const selected = ref<Benchmark | null>(null);
const metadataDialog = ref<InstanceType<typeof BenchmarkMetadataDialog> | null>(null);

watch(
  () => props.benchmarks,
  (benchmarks) => {
    selected.value =
      benchmarks.find((item) => item.benchmark_url === selected.value?.benchmark_url) ||
      groupBenchmarks(benchmarks)[0]?.rows[0] ||
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
</script>

<template>
  <section class="section-block">
    <div class="section-heading"><h2 class="section-title">Benchmarks</h2></div>
    <div class="benchmark-toolbar">
      <span class="search">
        <i class="pi pi-search" aria-hidden="true"></i>
        <InputText
          v-model="search"
          type="search"
          placeholder="Search benchmarks..."
          aria-label="Search benchmarks"
        />
      </span>
      <Button
        label="Reload"
        icon="pi pi-refresh"
        class="reload-button"
        :loading="refreshing"
        @click="emit('refresh')"
      />
    </div>
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
            removable-sort
            class="benchmark-grid"
            @row-select="selectRun($event.data)"
          >
            <Column selection-mode="single" header-style="width: 48px" />
            <Column
              field="version"
              header="Version"
              sortable
              header-class="version-column"
              body-class="version-column"
            />
            <Column
              field="description"
              header="Description"
              sortable
              header-class="description-column"
              body-class="description-column"
            >
              <template #body="slot">{{ slot.data.description || '—' }}</template>
            </Column>
            <Column header-class="action-column" body-class="action-column">
              <template #body="slot">
                <div class="grid-actions">
                  <GridActionLink
                    v-if="repositoryUrl(slot.data.repo)"
                    class="source-action"
                    :href="repositoryUrl(slot.data.repo)"
                    title="Open GitHub repository"
                  >
                    <i class="fa-brands fa-github github-icon" aria-hidden="true"></i>
                  </GridActionLink>
                  <GridActionLink
                    v-if="slot.data.benchmark_url"
                    class="rohub-action"
                    :href="slot.data.benchmark_url"
                    title="Open benchmark in RoHub"
                  >
                    <img class="grid-action-icon" src="/assets/rohub.svg" alt="" />
                  </GridActionLink>
                  <GridActionLink
                    v-if="jupyterUrl(repositoryUrl(slot.data.repo))"
                    class="notebook-action"
                    :href="jupyterUrl(repositoryUrl(slot.data.repo))"
                    title="Open repository in Jupyter Notebook"
                  >
                    <svg
                      class="grid-action-icon"
                      viewBox="0 0 24 24"
                      :fill="`#${siJupyter.hex}`"
                      aria-hidden="true"
                    >
                      <path :d="siJupyter.path" />
                    </svg>
                  </GridActionLink>
                  <button
                    class="grid-icon-button"
                    type="button"
                    title="View parameters and metrics"
                    aria-label="View parameters and metrics"
                    @click.stop="metadataDialog?.open(slot.data)"
                  >
                    <i class="pi pi-info-circle" aria-hidden="true"></i>
                  </button>
                </div>
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
          <span v-else>{{
            benchmarks.length ? 'No benchmarks match the search.' : 'No benchmarks are available.'
          }}</span>
        </p>
      </div>
      <div v-if="loading" class="grid-loading-overlay">
        <ProgressSpinner aria-label="Loading benchmarks" />
      </div>
    </div>
  </section>

  <BenchmarkMetadataDialog ref="metadataDialog" />
</template>
