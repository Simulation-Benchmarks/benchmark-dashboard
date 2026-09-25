import { Component, computed, effect, input, output, signal } from '@angular/core';
import { AgGridAngular } from 'ag-grid-angular';
import {
  ColDef,
  GridApi,
  GridReadyEvent,
  ICellRendererParams,
  IRowNode,
  IsFullWidthRowParams,
  RowClickedEvent,
  SelectionChangedEvent,
} from 'ag-grid-community';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { Run } from '../../core/models/benchmark.models';
import {
  formatPublishedDate,
  formatPublishedDateTooltip,
  resourceLabel,
} from '../../shared/utils/display-formatters';
import { imageLink, textLink } from '../../shared/utils/grid-cell-renderers';

interface SoftwareGroupRow {
  kind: 'software-group';
  key: string;
  name: string;
  url: string | null;
  count: number;
}

type RunGridRow = Run | SoftwareGroupRow;

function isSoftwareGroup(row: RunGridRow | undefined): row is SoftwareGroupRow {
  return !!row && 'kind' in row && row.kind === 'software-group';
}

@Component({
  selector: 'app-published-runs',
  standalone: true,
  imports: [AgGridAngular, ButtonModule, InputTextModule, ProgressSpinnerModule],
  templateUrl: './published-runs.component.html',
  styleUrl: './published-runs.component.css',
})
export class PublishedRunsComponent {
  readonly runs = input.required<Run[]>();
  readonly loading = input(false);
  readonly updated = input('');
  readonly refreshRequested = output<void>();
  readonly analysisRequested = output<Run[]>();
  readonly mainBranchOnly = signal(true);
  readonly searchTerm = signal('');
  readonly collapsedGroups = signal<ReadonlySet<string>>(new Set());
  readonly visibleRuns = computed(() =>
    this.runs().filter(
      (run) =>
        run.graph_valid && (!this.mainBranchOnly() || run.branch_url?.endsWith('/tree/main')),
    ),
  );
  readonly groupedRows = computed<RunGridRow[]>(() => {
    const term = this.searchTerm().trim().toLocaleLowerCase();
    const groups = new Map<string, { name: string; runs: Run[] }>();
    for (const run of this.visibleRuns()) {
      if (
        term &&
        ![
          run.software_name,
          run.software_url,
          run.software_version,
          run.benchmark_repo,
          run.branch_url,
          run.datePublished,
        ].some((value) => value?.toLocaleLowerCase().includes(term))
      ) {
        continue;
      }
      const name = run.software_name?.trim() || 'Unknown software';
      const key = name.toLocaleLowerCase();
      const group = groups.get(key) ?? { name, runs: [] };
      group.runs.push(run);
      groups.set(key, group);
    }

    const rows: RunGridRow[] = [];
    for (const [key, group] of [...groups].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
      const url =
        group.runs.find((run) => run.software_version && run.software_url)?.software_url ??
        group.runs.find((run) => run.software_url)?.software_url ??
        null;
      rows.push({ kind: 'software-group', key, name: group.name, url, count: group.runs.length });
      if (!this.collapsedGroups().has(key)) {
        rows.push(...group.runs.sort((a, b) => (b.datePublished || '').localeCompare(a.datePublished || '')));
      }
    }
    return rows;
  });

  selectedRuns: Run[] = [];
  private gridApi?: GridApi<RunGridRow>;
  readonly getRowId = (params: { data: RunGridRow }) =>
    isSoftwareGroup(params.data) ? `software-group:${params.data.key}` : params.data.run_id;
  readonly isFullWidthRow = (params: IsFullWidthRowParams<RunGridRow>) =>
    isSoftwareGroup(params.rowNode.data);
  readonly isRowSelectable = (node: IRowNode<RunGridRow>) => !isSoftwareGroup(node.data);
  readonly defaultColDef: ColDef = { sortable: false, resizable: true, filter: false };
  readonly columns: ColDef<RunGridRow>[] = [
    {
      headerName: 'Version',
      field: 'software_version',
      minWidth: 110,
      width: 120,
    },
    {
      headerName: 'Published',
      field: 'datePublished',
      minWidth: 180,
      valueFormatter: (params) => formatPublishedDate(params.value),
      tooltipValueGetter: (params) => formatPublishedDateTooltip(params.value),
      cellClass: 'published-date',
    },
    {
      headerName: 'Source',
      field: 'branch_url',
      width: 95,
      sortable: false,
      filter: false,
      floatingFilter: false,
      cellClass: 'centered-column',
      headerClass: 'centered-column-header',
      cellRenderer: (params: ICellRendererParams<RunGridRow>) =>
        imageLink(
          isSoftwareGroup(params.data) ? null : params.data?.branch_url,
          'assets/github.svg',
          'Open run GitHub repository',
          'GitHub',
        ),
    },
    {
      headerName: 'RoHub',
      width: 95,
      sortable: false,
      filter: false,
      floatingFilter: false,
      cellRenderer: (params: ICellRendererParams<RunGridRow>) =>
        imageLink(
          isSoftwareGroup(params.data) ? null : params.data?.run_id,
          'assets/rohub.svg',
          'Open run in RoHub',
          'RoHub',
          'rohub-action',
        ),
    },
    {
      headerName: 'Named graph',
      minWidth: 170,
      sortable: false,
      filter: false,
      floatingFilter: false,
      cellRenderer: (params: ICellRendererParams<RunGridRow>) =>
        textLink(
          isSoftwareGroup(params.data) ? null : params.data?.graph,
          `Graph ${resourceLabel(isSoftwareGroup(params.data) ? null : params.data?.graph).slice(0, 8)}… ↗`,
          'mono',
        ),
    },
  ];

  readonly groupRenderer = (params: ICellRendererParams<RunGridRow>): HTMLElement => {
    const group = params.data;
    const container = document.createElement('div');
    if (!isSoftwareGroup(group)) return container;
    container.className = 'software-group-row';
    const title = document.createElement('div');
    title.className = 'software-group-title';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'software-group-toggle';
    button.setAttribute('aria-expanded', String(!this.collapsedGroups().has(group.key)));
    button.setAttribute('aria-label', `${this.collapsedGroups().has(group.key) ? 'Expand' : 'Collapse'} ${group.name} runs`);
    button.textContent = this.collapsedGroups().has(group.key) ? '▸' : '▾';
    button.addEventListener('click', () => this.toggleGroup(group.key));
    title.append(button, textLink(group.url, group.name));
    const count = document.createElement('span');
    count.className = 'software-group-count';
    count.textContent = `${group.count} ${group.count === 1 ? 'run' : 'runs'}`;
    container.append(title, count);
    return container;
  };

  constructor() {
    effect(() => {
      this.visibleRuns();
      queueMicrotask(() => this.resetDetailGrid());
    });
  }

  gridReady(event: GridReadyEvent<RunGridRow>): void {
    this.gridApi = event.api;
  }
  resetDetailGrid(): void {
    this.selectedRuns = [];
    this.gridApi?.deselectAll();
  }
  search(value: string): void {
    this.searchTerm.set(value);
  }
  toggleGroup(key: string): void {
    const collapsed = new Set(this.collapsedGroups());
    if (collapsed.has(key)) collapsed.delete(key);
    else collapsed.add(key);
    this.collapsedGroups.set(collapsed);
  }
  selectionChanged(event: SelectionChangedEvent<RunGridRow>): void {
    this.selectedRuns = event.api.getSelectedRows().filter((row): row is Run => !isSoftwareGroup(row));
  }
  openSingle(event: RowClickedEvent<RunGridRow>): void {
    const target = event.event?.target as HTMLElement | null;
    if (!event.data || isSoftwareGroup(event.data) || target?.closest('a, button, input, .ag-selection-checkbox')) return;
    this.analysisRequested.emit([event.data]);
  }
  compare(): void {
    if (this.canCompare) this.analysisRequested.emit(this.selectedRuns);
  }
  get canCompare(): boolean {
    return (
      this.selectedRuns.length >= 2 &&
      this.selectedRuns.every((run) => run.benchmark_url === this.selectedRuns[0].benchmark_url)
    );
  }
  get compareHint(): string {
    if (this.selectedRuns.length < 2) return 'Select at least two runs to compare';
    return this.canCompare
      ? `Compare ${this.selectedRuns.length} selected runs`
      : 'Select runs from the same benchmark';
  }
}
