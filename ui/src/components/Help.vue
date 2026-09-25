<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';

interface TourStep { selector: string; fallback?: string; title: string; description: string }
const steps: TourStep[] = [
  { selector: '.benchmark-grid', title: 'Choose a benchmark', description: 'Select a row in the benchmark table to filter the published runs below.' },
  { selector: '.metadata-button', fallback: '.benchmark-grid', title: 'Inspect benchmark metadata', description: 'Load the benchmark definition on demand to inspect parameters and metrics.' },
  { selector: '.runs-grid', title: 'Review published runs', description: 'Runs are grouped by software. Expand a group to inspect versions, publication dates, RoHub links, and named graphs.' },
  { selector: '.compare-trigger', title: 'Compare compatible runs', description: 'Select at least two runs from the same benchmark, then open shared tables and plots.' },
  { selector: '.log-launcher', title: 'Trace backend SPARQL queries', description: 'Open Logs to inspect live queries and copy them for the RoHub endpoint.' },
];
const visible = ref(false);
const tourVisible = ref(false);
const stepIndex = ref(0);
const card = ref<HTMLElement | null>(null);
const cardStyle = ref<Record<string, string>>({ top: '16px', left: '16px' });
const currentStep = computed(() => steps[stepIndex.value]);
let highlighted: HTMLElement | null = null;
let timer: number | undefined;

function clearHighlight(): void {
  highlighted?.classList.remove('tour-target');
  highlighted = null;
}

function resolveElement(): HTMLElement | null {
  const { selector, fallback } = currentStep.value;
  return document.querySelector<HTMLElement>(selector)
    || (fallback ? document.querySelector<HTMLElement>(fallback) : null);
}

async function positionTour(scroll = false): Promise<void> {
  await nextTick();
  const element = resolveElement();
  if (element && scroll) element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  clearHighlight();
  if (element) {
    element.classList.add('tour-target');
    highlighted = element;
  }
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    if (!card.value) return;
    const width = Math.min(360, window.innerWidth - 32);
    const height = card.value.offsetHeight || 240;
    const rect = element?.getBoundingClientRect();
    const top = rect ? (rect.top < height + 48 ? rect.bottom + 16 : rect.top - height - 16) : (window.innerHeight - height) / 2;
    const left = rect ? rect.left + rect.width / 2 - width / 2 : (window.innerWidth - width) / 2;
    cardStyle.value = { top: `${Math.max(16, Math.min(top, window.innerHeight - height - 16))}px`, left: `${Math.max(16, Math.min(left, window.innerWidth - width - 16))}px`, width: `${width}px` };
  }, 220);
}

function startTour(): void {
  visible.value = false;
  tourVisible.value = true;
  stepIndex.value = 0;
  void positionTour(true);
}

function closeTour(): void {
  tourVisible.value = false;
  window.clearTimeout(timer);
  clearHighlight();
}

function nextStep(): void {
  if (stepIndex.value === steps.length - 1) closeTour();
  else {
    stepIndex.value++;
    void positionTour(true);
  }
}

function previousStep(): void {
  if (stepIndex.value > 0) {
    stepIndex.value--;
    void positionTour(true);
  }
}

function onViewportChange(): void {
  if (tourVisible.value) void positionTour();
}
onMounted(() => {
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('scroll', onViewportChange);
});
onBeforeUnmount(() => {
  closeTour();
  window.removeEventListener('resize', onViewportChange);
  window.removeEventListener('scroll', onViewportChange);
});
</script>

<template>
  <button class="help-link" type="button" @click="visible = true"><i class="pi pi-question-circle" aria-hidden="true"></i><span>Help</span></button>
  <Dialog v-model:visible="visible" modal maximizable :style="{ width: 'min(960px, 94vw)' }" :content-style="{ height: 'min(760px, 82vh)', overflow: 'auto' }">
    <template #header><h2>User guide</h2></template>
    <section class="help-section intro"><div class="intro-actions"><Button label="Start guided tour" icon="pi pi-directions" size="small" @click="startTour" /></div><p>This dashboard groups published simulation runs by benchmark, lets you inspect benchmark metadata, and helps you compare runs from the same benchmark.</p></section>
    <section class="help-section"><h3>Using the dashboard</h3><div class="help-grid">
      <article class="help-card"><h4>1. Choose a benchmark</h4><p>Select a benchmark in the top table to see its published runs below.</p></article>
      <article class="help-card"><h4>2. Inspect metadata</h4><p>Use the metadata button to load parameter and metric names on demand.</p></article>
      <article class="help-card"><h4>3. Explore published runs</h4><p>Search by software, open links, and reload to bypass the API cache.</p></article>
      <article class="help-card"><h4>4. Compare runs</h4><p>Select at least two runs from one benchmark and choose Compare for shared tables and plots.</p></article>
      <article class="help-card"><h4>5. Review SPARQL activity</h4><p>Open Logs to inspect and copy backend queries for the RoHub endpoint.</p></article>
    </div></section>
    <section class="help-section"><h3>Explore the code and benchmarks on Github</h3><div class="resource-list"><a href="https://github.com/Simulation-Benchmarks" target="_blank" rel="noopener noreferrer">Simulation-Benchmarks</a></div></section>
  </Dialog>
  <template v-if="tourVisible">
    <div class="tour-overlay" @click="closeTour"></div>
    <aside ref="card" class="tour-card" :style="cardStyle" role="dialog" aria-modal="true" aria-label="Guided tour" @click.stop>
      <button type="button" class="tour-close" aria-label="Close guided tour" @click="closeTour"><i class="pi pi-times"></i></button>
      <div class="tour-count">Step {{ stepIndex + 1 }} of {{ steps.length }}</div>
      <h3>{{ currentStep.title }}</h3><p>{{ currentStep.description }}</p>
      <div class="tour-actions"><button type="button" class="tour-secondary" :disabled="stepIndex === 0" @click="previousStep">Back</button><div class="tour-actions-right"><button type="button" class="tour-secondary" @click="closeTour">Close</button><button type="button" class="tour-primary" @click="nextStep">{{ stepIndex === steps.length - 1 ? 'Finish' : 'Next' }}</button></div></div>
    </aside>
  </template>
</template>
