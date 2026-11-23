import type { Run } from './models';

export type RunRow = Run & { software_group_key: string };
export interface SoftwareGroup {
  name: string;
  url: string | null;
  count: number;
}

export function visibleRuns(runs: Run[], mainBranchOnly: boolean): Run[] {
  return runs.filter((run) => !mainBranchOnly || run.branch_url?.endsWith('/tree/main'));
}

export function groupRuns(runs: Run[], search: string): RunRow[] {
  const term = search.trim().toLocaleLowerCase();
  const bySoftware = new Map<string, RunRow[]>();
  for (const run of runs) {
    if (
      term &&
      ![
        run.software_name,
        run.title,
        run.description,
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
}

export function softwareGroups(runs: RunRow[]): Map<string, SoftwareGroup> {
  const groups = new Map<string, SoftwareGroup>();
  for (const run of runs) {
    const group = groups.get(run.software_group_key) || {
      name: run.software_name?.trim() || 'Unknown software',
      url: null,
      count: 0,
    };
    group.count++;
    if (run.software_url && (!group.url || run.software_version)) group.url = run.software_url;
    groups.set(run.software_group_key, group);
  }
  return groups;
}

export function canCompareRuns(runs: Run[]): boolean {
  return runs.length >= 2 && runs.every((run) => run.benchmark_url === runs[0].benchmark_url);
}
