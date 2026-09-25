<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import { api } from '../lib/api';
import type { SparqlEntry } from '../lib/models';

const visible = ref(false);
const clearing = ref(false);
const entries = ref<SparqlEntry[]>([]);
const error = ref('');
const collapsed = ref(new Set<number>());
const copiedId = ref<number | null>(null);
let pollTimer: number | undefined;
let copyTimer: number | undefined;

async function refresh(): Promise<void> {
  try {
    entries.value = (await api.sparqlLog()).items;
    error.value = '';
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The query log could not be loaded.';
  }
}

function open(): void {
  visible.value = true;
  void refresh();
  stopPolling();
  pollTimer = window.setInterval(() => void refresh(), 1000);
}

function stopPolling(): void {
  window.clearInterval(pollTimer);
  pollTimer = undefined;
}

async function clear(): Promise<void> {
  clearing.value = true;
  try {
    await api.clearSparqlLog();
    entries.value = [];
    collapsed.value = new Set();
    copiedId.value = null;
  } catch {
    error.value = 'The query log could not be cleared.';
  } finally {
    clearing.value = false;
  }
}

function toggle(id: number): void {
  const next = new Set(collapsed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  collapsed.value = next;
}

async function copy(entry: SparqlEntry): Promise<void> {
  await navigator.clipboard.writeText(entry.query);
  copiedId.value = entry.id;
  window.clearTimeout(copyTimer);
  copyTimer = window.setTimeout(() => { copiedId.value = null; }, 1600);
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString();
}

onBeforeUnmount(() => {
  stopPolling();
  window.clearTimeout(copyTimer);
});
</script>

<template>
  <div class="log-launcher">
    <Button label="Logs" icon="pi pi-history" class="logs-button" severity="contrast" @click="open" />
  </div>
  <Dialog v-model:visible="visible" class="sparql-log-dialog" modal maximizable :style="{ width: 'min(920px, 94vw)' }" :content-style="{ height: 'min(620px, 70vh)', overflow: 'auto' }" @hide="stopPolling">
    <template #header><div><span class="eyebrow">Live execution flow</span><h2>SPARQL queries</h2><small>{{ entries.length }} recent queries · updates every second</small></div></template>
    <div class="log-toolbar"><Button label="Clear" icon="pi pi-trash" severity="danger" outlined size="small" :disabled="clearing" @click="clear" /></div>
    <p class="endpoint-notice">Run copied queries directly on the RoHub SPARQL endpoint: <a href="https://virtuoso-rohub2020-production.apps.bst2.paas.psnc.pl/sparql" target="_blank" rel="noopener noreferrer">virtuoso-rohub2020-production.apps.bst2.paas.psnc.pl/sparql</a></p>
    <p v-if="error" class="error state">{{ error }}</p><p v-else-if="!entries.length" class="state">No SPARQL query has run yet.</p>
    <article v-for="entry in entries" :key="entry.id" class="log-entry">
      <header><span class="status" :class="entry.status">{{ entry.status }}</span><time>{{ formatTime(entry.started_at) }}</time><span>{{ entry.duration_ms === null ? 'In progress' : `${entry.duration_ms} ms` }}</span>
        <div class="log-actions"><button class="log-action" type="button" :aria-label="copiedId === entry.id ? 'Query copied' : 'Copy query'" @click="copy(entry)"><i class="pi" :class="copiedId === entry.id ? 'pi-check' : 'pi-copy'"></i></button><button class="log-action" type="button" :aria-expanded="!collapsed.has(entry.id)" :aria-controls="`sparql-log-${entry.id}`" :aria-label="collapsed.has(entry.id) ? 'Expand query' : 'Collapse query'" @click="toggle(entry.id)"><i class="pi" :class="collapsed.has(entry.id) ? 'pi-chevron-down' : 'pi-chevron-up'"></i></button></div>
      </header>
      <div v-if="!collapsed.has(entry.id)" :id="`sparql-log-${entry.id}`"><pre>{{ entry.query }}</pre><p v-if="entry.error" class="query-error">{{ entry.error }}</p></div>
    </article>
  </Dialog>
</template>
