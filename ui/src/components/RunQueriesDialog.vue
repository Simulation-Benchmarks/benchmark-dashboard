<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import Dialog from 'primevue/dialog';
import type { RunAnalysisData } from '../lib/analysis';

defineProps<{ analysis: RunAnalysisData | null }>();
const visible = defineModel<boolean>('visible', { required: true });
const copiedRunId = ref<string | null>(null);
const collapsedQueries = ref(new Set<string>());
let copyTimer: number | undefined;

function resetCopiedQuery(): void {
  window.clearTimeout(copyTimer);
  copyTimer = undefined;
  copiedRunId.value = null;
}

function toggleQuery(runId: string): void {
  const next = new Set(collapsedQueries.value);
  if (next.has(runId)) next.delete(runId);
  else next.add(runId);
  collapsedQueries.value = next;
}

async function copyQuery(runId: string, query: string): Promise<void> {
  await navigator.clipboard.writeText(query);
  resetCopiedQuery();
  copiedRunId.value = runId;
  copyTimer = window.setTimeout(resetCopiedQuery, 1600);
}

function reset(): void {
  resetCopiedQuery();
  collapsedQueries.value = new Set();
}

onBeforeUnmount(resetCopiedQuery);
defineExpose({ reset });
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    maximizable
    :style="{ width: 'min(960px, 94vw)' }"
    :content-style="{ maxHeight: '70vh', overflow: 'auto' }"
    @hide="resetCopiedQuery"
  >
    <template #header>
      <h2>{{ analysis?.runCount === 1 ? 'SPARQL query' : 'SPARQL queries' }}</h2>
    </template>
    <p class="endpoint-notice">
      Run copied queries directly on the RoHub SPARQL endpoint:
      <a
        href="https://virtuoso-rohub2020-production.apps.bst2.paas.psnc.pl/sparql"
        target="_blank"
        rel="noopener noreferrer"
        >virtuoso-rohub2020-production.apps.bst2.paas.psnc.pl/sparql</a
      >
    </p>
    <div class="run-query-list">
      <section
        v-for="(detail, index) in analysis?.runDetails || []"
        :key="detail.runId"
        class="run-query-item"
      >
        <div class="run-query-heading">
          <div>
            <h3>
              {{ detail.softwareName }} · {{ detail.softwareVersion || 'Version unavailable' }}
            </h3>
            <small>{{ detail.runId }}</small>
          </div>
          <div v-if="detail.query" class="log-actions">
            <button
              class="log-action"
              type="button"
              :aria-label="copiedRunId === detail.runId ? 'Query copied' : 'Copy query'"
              :title="copiedRunId === detail.runId ? 'Query copied' : 'Copy query'"
              @click="copyQuery(detail.runId, detail.query)"
            >
              <i class="pi" :class="copiedRunId === detail.runId ? 'pi-check' : 'pi-copy'"></i>
            </button>
            <button
              class="log-action"
              type="button"
              :aria-expanded="!collapsedQueries.has(detail.runId)"
              :aria-controls="`run-query-${index}`"
              :aria-label="collapsedQueries.has(detail.runId) ? 'Expand query' : 'Collapse query'"
              @click="toggleQuery(detail.runId)"
            >
              <i
                class="pi"
                :class="collapsedQueries.has(detail.runId) ? 'pi-chevron-down' : 'pi-chevron-up'"
              ></i>
            </button>
          </div>
        </div>
        <pre
          v-if="detail.query && !collapsedQueries.has(detail.runId)"
          :id="`run-query-${index}`"
          >{{ detail.query }}</pre>
        <p v-if="!detail.query">Query unavailable.</p>
      </section>
    </div>
  </Dialog>
</template>
