import { computed, ref } from 'vue';
import { api } from '../lib/api';
import type { Benchmark, Run } from '../lib/models';

export function useDashboardData() {
  const benchmarks = ref<Benchmark[]>([]);
  const runs = ref<Run[]>([]);
  const selectedBenchmarkUrl = ref('');
  const publishedRuns = computed(() =>
    selectedBenchmarkUrl.value
      ? runs.value.filter((run) => run.benchmark_url === selectedBenchmarkUrl.value)
      : runs.value,
  );
  const benchmarkLoading = ref(true);
  const runsLoading = ref(true);
  const benchmarkError = ref('');
  const runsError = ref('');
  const updated = ref('');
  let requestId = 0;

  async function load(refresh = false): Promise<void> {
    const currentRequest = ++requestId;
    benchmarkLoading.value = true;
    runsLoading.value = true;
    benchmarkError.value = '';
    runsError.value = '';

    await Promise.all([
      api
        .benchmarks(refresh)
        .then((response) => {
          if (currentRequest === requestId) benchmarks.value = response.items;
        })
        .catch((cause) => {
          if (currentRequest === requestId)
            benchmarkError.value =
              cause instanceof Error ? cause.message : 'Benchmarks could not be loaded.';
        })
        .finally(() => {
          if (currentRequest === requestId) benchmarkLoading.value = false;
        }),
      api
        .runs(refresh)
        .then((response) => {
          if (currentRequest !== requestId) return;
          runs.value = response.items;
          updated.value = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        })
        .catch((cause) => {
          if (currentRequest === requestId)
            runsError.value = cause instanceof Error ? cause.message : 'Runs could not be loaded.';
        })
        .finally(() => {
          if (currentRequest === requestId) runsLoading.value = false;
        }),
    ]);
  }

  return {
    benchmarks,
    publishedRuns,
    selectedBenchmarkUrl,
    benchmarkLoading,
    runsLoading,
    benchmarkError,
    runsError,
    updated,
    load,
  };
}
