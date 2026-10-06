<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import { createUniver, defaultTheme, LocaleType, mergeLocales } from '@univerjs/presets';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import UniverSheetsCoreEnUS from '@univerjs/preset-sheets-core/locales/en-US';
import { UniverSheetsFilterPreset } from '@univerjs/preset-sheets-filter';
import UniverSheetsFilterEnUS from '@univerjs/preset-sheets-filter/locales/en-US';
import { UniverSheetsSortPreset } from '@univerjs/preset-sheets-sort';
import UniverSheetsSortEnUS from '@univerjs/preset-sheets-sort/locales/en-US';
import type { Univer } from '@univerjs/core';
import type { FUniver } from '@univerjs/core/facade';
import type { FWorksheet } from '@univerjs/sheets/facade';
import type { IDisposable } from '@univerjs/core';
import type { AnalysisRow, RunAnalysisData } from '../lib/analysis';
import type { ValueColumn } from '../lib/models';
import { colors, dark } from '../lib/theme';
import '@univerjs/preset-sheets-core/lib/index.css';
import '@univerjs/preset-sheets-filter/lib/index.css';
import '@univerjs/preset-sheets-sort/lib/index.css';

export interface SheetSnapshot {
  columns: ValueColumn[];
  rows: AnalysisRow[];
  visibleRows: AnalysisRow[];
}

const props = defineProps<{ data: RunAnalysisData }>();
const emit = defineEmits<{ change: [snapshot: SheetSnapshot] }>();
const container = ref<HTMLElement | null>(null);
const error = ref('');
const renameDialogVisible = ref(false);
const renameColumnIndex = ref<number | null>(null);
const renameDraft = ref('');
const renameInput = ref<HTMLInputElement | null>(null);
let univer: Univer | null = null;
let api: FUniver | null = null;
let sheet: FWorksheet | null = null;
let subscriptions: IDisposable[] = [];
let syncTimer: number | undefined;
let headerTimer: number | undefined;
let displayedHeaders = '';
let headersReady = false;
let sizedContent = '';
let contextColumn: number | null = null;

const metadata =
  props.data.runCount > 1
    ? [
        { key: '__software', label: 'Software' },
        { key: '__software_version', label: 'Version' },
        { key: '__run_id', label: 'Run' },
      ]
    : [{ key: '__tool_name', label: 'Tool' }];
const sourceColumns = [...metadata, ...props.data.columns];
const sourceRowCount = props.data.rows.length;
const namedHeaders = new Map(sourceColumns.map((column, index) => [index, column.label]));

function columnLetter(index: number): string {
  let value = index + 1;
  let label = '';
  while (value) {
    value--;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function registerColumnNames(): void {
  if (!sheet) return;
  const used = new Set<string>();
  const validName = (name: string) =>
    /^[A-Za-z_][A-Za-z_0-9]*$/.test(name) &&
    !/^[A-Za-z]{1,3}[1-9]\d*$/i.test(name) &&
    !/^R[1-9]\d*C[1-9]\d*$/i.test(name);

  const register = (names: 'key' | 'label') => {
    props.data.columns.forEach((column, offset) => {
      const index = metadata.length + offset;
      const reference = `Values!$${columnLetter(index)}:$${columnLetter(index)}`;
      const name = column[names];
      const normalized = name.trim();
      const identity = normalized.toLowerCase();
      if (!validName(normalized) || used.has(identity)) return;
      try {
        sheet?.insertDefinedName(normalized, reference);
        used.add(identity);
      } catch {
        // An invalid or reserved label should not prevent the grid from loading.
      }
    });
  };
  register('key');
  register('label');
}

function sheetColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Univer inverts canvas style colors in dark mode, including colors supplied by the host app.
function canvasColor(color: string): string {
  if (!dark.value || !/^#[\da-f]{6}$/i.test(color)) return color;
  const channels = color.slice(1).match(/../g) || [];
  return `#${channels.map((channel) => (255 - Number.parseInt(channel, 16)).toString(16).padStart(2, '0')).join('')}`;
}

function styleHeaderRow(): void {
  if (!sheet) return;
  // Univer draws dark-mode filter icons in black, so the filter row stays light.
  const background = dark.value ? '#303030' : sheetColor('--soft');
  sheet
    .getRange(0, 0, 1, Math.max(sourceColumns.length + 12, 26))
    .setBackgroundColor(background)
    .setFontColor(background);
}

function updateCalculatedHeaderFromName(params: {
  unitId?: string;
  localSheetId?: string;
  name?: string;
  formulaOrRefString?: string;
}): void {
  if (!sheet || params.unitId !== 'run-values' || !params.name || !params.formulaOrRefString)
    return;
  if (params.localSheetId && params.localSheetId !== sheet.getSheetId()) return;
  try {
    const reference = params.formulaOrRefString.replace(/^=/, '');
    const range = sheet.getRange(reference).getRange();
    if (
      range.startColumn < sourceColumns.length ||
      range.startColumn !== range.endColumn ||
      range.startRow !== 0 ||
      range.endRow < sheet.getMaxRows() - 1
    )
      return;
    namedHeaders.set(range.startColumn, params.name);
    scheduleSnapshot();
  } catch {
    // Formula-based names and references to other sheets are not column headers.
  }
}

function renameContextColumn(): void {
  if (!sheet) return;
  const index = contextColumn ?? sheet.getActiveRange()?.getRange().startColumn;
  contextColumn = null;
  if (index === undefined || index === null || index >= sheet.getMaxColumns()) return;
  renameColumnIndex.value = index;
  renameDraft.value = namedHeaders.get(index) || `Column ${index + 1}`;
  renameDialogVisible.value = true;
}

function focusRenameInput(): void {
  renameInput.value?.focus();
  renameInput.value?.select();
}

function saveColumnName(): void {
  const index = renameColumnIndex.value;
  const name = renameDraft.value.trim();
  if (index === null || !name) return;
  namedHeaders.set(index, name);
  renameDialogVisible.value = false;
  snapshot();
}

function snapshot(): void {
  if (!sheet) return;
  const lastRow = Math.max(sheet.getLastRow(), sourceRowCount);
  const lastColumn = Math.max(
    sheet.getLastColumn(),
    sourceColumns.length - 1,
    ...namedHeaders.keys(),
  );
  const values = sheet.getRange(0, 0, lastRow + 1, lastColumn + 1).getValues();
  const headerLabel = (index: number): string => namedHeaders.get(index) || `Column ${index + 1}`;
  const columns: ValueColumn[] = [];
  const usedColumns = sourceColumns.map((source, index) => ({
    ...source,
    index,
  }));
  for (let index = sourceColumns.length; index <= lastColumn; index++) {
    const heading = namedHeaders.get(index);
    if (
      !heading &&
      !values
        .slice(1)
        .some((row) => row[index] !== null && row[index] !== undefined && row[index] !== '')
    )
      continue;
    const column = {
      key: `sheet_calc_${index}`,
      label: headerLabel(index),
      kind: 'calculated' as const,
    };
    usedColumns.push({ ...column, index });
    columns.push(column);
  }
  columns.unshift(
    ...props.data.columns.map((column) => ({
      ...column,
      label: headerLabel(sourceColumns.findIndex((source) => source.key === column.key)),
    })),
  );
  const headerLabels = usedColumns.map((column) => headerLabel(column.index));
  const nextHeaders = JSON.stringify(headerLabels);
  if (headersReady && nextHeaders !== displayedHeaders) {
    sheet.customizeColumnHeader({
      headerStyle: {
        fontFamily: 'IBM Plex',
        fontSize: 13,
        fontColor: dark.value ? '#111111' : colors.value.text,
        backgroundColor: dark.value ? '#e9e9e9' : sheetColor('--soft'),
        borderColor: dark.value ? '#c8c8c8' : sheetColor('--column-line'),
      },
      columnsCfg: Object.fromEntries(
        usedColumns.map((column) => {
          const kind = props.data.columns.find((source) => source.key === column.key)?.kind;
          const tint =
            kind === 'parameter'
              ? '--parameter-soft'
              : kind === 'metric'
                ? '--metric-soft'
                : '--soft';
          const ink =
            kind === 'parameter' ? '--parameter' : kind === 'metric' ? '--metric' : '--text';
          return [
            column.index,
            {
              text: headerLabel(column.index),
              textAlign: 'left' as const,
              fontFamily: 'IBM Plex',
              fontSize: 13,
              fontColor: canvasColor(sheetColor(ink)),
              backgroundColor: canvasColor(sheetColor(tint)),
              borderColor: canvasColor(sheetColor('--column-line')),
            },
          ];
        }),
      ),
    });
    displayedHeaders = nextHeaders;
  }
  if (headersReady) {
    const content = JSON.stringify(
      usedColumns.map((column) => [
        headerLabel(column.index),
        ...values.slice(1).map((row) => row[column.index]),
      ]),
    );
    if (content !== sizedContent) {
      sizedContent = content;
      const context = document.createElement('canvas').getContext('2d');
      if (context) context.font = '13px IBM Plex';
      for (const column of usedColumns) {
        sheet.autoResizeColumns(column.index);
        const titleWidth = context?.measureText(headerLabel(column.index)).width ?? 0;
        const width = Math.min(
          480,
          Math.max(72, sheet.getColumnWidth(column.index), Math.ceil(titleWidth + 28)),
        );
        sheet.setColumnWidth(column.index, width);
      }
    }
  }
  const filtered = new Set(sheet.getFilter()?.getFilteredOutRows() || []);
  const rows: AnalysisRow[] = [];
  const visibleRows: AnalysisRow[] = [];
  for (let index = 1; index <= lastRow; index++) {
    const cells = values[index] || [];
    if (cells.every((value) => value === null || value === undefined || value === '')) continue;
    const row: AnalysisRow = { ...props.data.rows[index - 1] };
    for (const column of usedColumns) row[column.key] = cells[column.index] ?? null;
    rows.push(row);
    if (!filtered.has(index)) visibleRows.push(row);
  }
  emit('change', { columns, rows, visibleRows });
}

function scheduleSnapshot(): void {
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(snapshot, 80);
}

function presentHeaders(attempt = 0): void {
  if (!sheet) return;
  try {
    sheet.setColumnHeaderHeight(32);
    sheet.setRowHeaderWidth(58);
    sheet.customizeRowHeader({
      headerStyle: {
        fontFamily: 'IBM Plex',
        fontSize: 12,
        fontColor: dark.value ? '#111111' : colors.value.text,
        backgroundColor: dark.value ? '#e9e9e9' : sheetColor('--soft'),
        borderColor: dark.value ? '#c8c8c8' : sheetColor('--column-line'),
      },
      rowsCfg: { 0: 'Filter' },
    });
    headersReady = true;
    snapshot();
  } catch {
    if (attempt < 10) headerTimer = window.setTimeout(() => presentHeaders(attempt + 1), 100);
  }
}

watch(dark, (enabled) => {
  api?.toggleDarkMode(enabled);
  sheet?.setDefaultStyle({ ff: 'IBM Plex', fs: 11, cl: { rgb: canvasColor(colors.value.text) } });
  styleHeaderRow();
  displayedHeaders = '';
  sizedContent = '';
  presentHeaders();
});

onMounted(() => {
  if (!container.value) return;
  try {
    const instance = createUniver({
      darkMode: dark.value,
      theme: {
        ...defaultTheme,
        primary: {
          ...defaultTheme.primary,
          50: '#e8f4fb',
          100: '#d1eaf8',
          500: '#0d83c7',
          600: '#046cb4',
          700: '#00588f',
        },
      },
      locale: LocaleType.EN_US,
      locales: {
        [LocaleType.EN_US]: mergeLocales(
          UniverSheetsCoreEnUS,
          UniverSheetsFilterEnUS,
          UniverSheetsSortEnUS,
        ),
      },
      presets: [
        UniverSheetsCorePreset({
          container: container.value,
          toolbar: window.innerHeight >= 650,
          formulaBar: window.innerHeight >= 650,
          footer: window.innerHeight >= 650 ? { sheetBar: false } : false,
        }),
        UniverSheetsFilterPreset(),
        UniverSheetsSortPreset(),
      ],
    });
    univer = instance.univer;
    api = instance.univerAPI;
    const cellData: Record<number, Record<number, { v: string | number | boolean }>> = {};
    props.data.rows.forEach((row, rowIndex) => {
      cellData[rowIndex + 1] = Object.fromEntries(
        sourceColumns.flatMap((column, columnIndex) => {
          const value = row[column.key];
          return typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
            ? [[columnIndex, { v: value }]]
            : [];
        }),
      );
    });
    const columnCount = Math.max(sourceColumns.length + 12, 26);
    const workbook = api.createWorkbook({
      id: 'run-values',
      name: 'Run values',
      sheetOrder: ['values'],
      sheets: {
        values: {
          id: 'values',
          name: 'Values',
          rowCount: Math.max(sourceRowCount + 1, 1),
          columnCount,
          cellData,
        },
      },
    });
    sheet = workbook.getActiveSheet();
    api
      .createMenu({
        id: 'run-values.rename-column',
        title: 'Rename column',
        action: renameContextColumn,
      })
      .appendTo(['contextMenu.colHeader', 'contextMenu.others']);
    registerColumnNames();
    sheet.setDefaultStyle({ ff: 'IBM Plex', fs: 11, cl: { rgb: canvasColor(colors.value.text) } });
    sheet.setRowHeight(0, 24);
    styleHeaderRow();
    const frozenColumns = props.data.runCount > 1 ? metadata.length : 0;
    sheet.setFreeze({
      startRow: 1,
      startColumn: frozenColumns,
      xSplit: frozenColumns,
      ySplit: 1,
    });
    if (sourceRowCount) sheet.getRange(0, 0, sourceRowCount + 1, columnCount).createFilter();
    subscriptions = [
      api.addEvent(api.Event.SheetValueChanged, scheduleSnapshot),
      api.addEvent(api.Event.SheetRangeFiltered, scheduleSnapshot),
      api.addEvent(api.Event.SheetRangeFilterCleared, scheduleSnapshot),
      api.addEvent(api.Event.SheetRangeSorted, scheduleSnapshot),
      api.addEvent(api.Event.SheetSkeletonChanged, scheduleSnapshot),
      api.addEvent(api.Event.ColumnHeaderPointerDown, ({ column }) => {
        contextColumn = column;
      }),
      api.addEvent(api.Event.CommandExecuted, ({ id, params }) => {
        if (id === 'formula.mutation.set-defined-name') updateCalculatedHeaderFromName(params);
      }),
    ];
    snapshot();
    headerTimer = window.setTimeout(presentHeaders, 100);
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The spreadsheet could not be loaded.';
  }
});

onBeforeUnmount(() => {
  window.clearTimeout(syncTimer);
  window.clearTimeout(headerTimer);
  subscriptions.forEach((subscription) => subscription.dispose());
  subscriptions = [];
  univer?.dispose();
  univer = null;
  api = null;
  sheet = null;
});
</script>

<template>
  <div class="values-spreadsheet">
    <Dialog
      v-model:visible="renameDialogVisible"
      header="Rename column"
      modal
      :style="{ width: 'min(360px, 92vw)' }"
      @show="focusRenameInput"
    >
      <form class="rename-column-form" @submit.prevent="saveColumnName">
        <label for="rename-column-name">Column name</label>
        <input
          id="rename-column-name"
          ref="renameInput"
          v-model="renameDraft"
          autocomplete="off"
          @keydown.esc="renameDialogVisible = false"
        />
        <div class="rename-column-actions">
          <Button label="Cancel" text type="button" @click="renameDialogVisible = false" />
          <Button label="Save" type="submit" :disabled="!renameDraft.trim()" />
        </div>
      </form>
    </Dialog>
    <div v-if="error" class="analysis-state error">{{ error }}</div>
    <div
      ref="container"
      class="values-spreadsheet-editor"
      aria-label="Run values spreadsheet"
    ></div>
  </div>
</template>
