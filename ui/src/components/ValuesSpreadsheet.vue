<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
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
const addingColumn = ref(false);
const columnName = ref('');
const columnFormula = ref('');
const columnError = ref('');
let univer: Univer | null = null;
let api: FUniver | null = null;
let sheet: FWorksheet | null = null;
let subscriptions: IDisposable[] = [];
let syncTimer: number | undefined;
let headerTimer: number | undefined;
let displayedHeaders = '';
let headersReady = false;

const metadata =
  props.data.runCount > 1
    ? [
        { key: '__software', label: 'Software' },
        { key: '__software_version', label: 'Software version' },
        { key: '__run_id', label: 'Run' },
        { key: '__tool_name', label: 'Tool' },
      ]
    : [{ key: '__tool_name', label: 'Tool' }];
const sourceColumns = [...metadata, ...props.data.columns];
const sourceRowCount = props.data.rows.length;
const namedHeaders = new Map(sourceColumns.map((column, index) => [index, column.label]));

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
  // Univer draws dark-mode filter icons in black, so the control row stays light.
  const background = dark.value ? '#303030' : sheetColor('--soft');
  sheet
    .getRange(0, 0, 1, Math.max(sourceColumns.length + 12, 26))
    .setBackgroundColor(background)
    .setFontColor(background);
}

function snapshot(): void {
  if (!sheet) return;
  const lastRow = Math.max(sheet.getLastRow(), sourceRowCount);
  const lastColumn = Math.max(sheet.getLastColumn(), sourceColumns.length - 1);
  const values = sheet.getRange(0, 0, lastRow + 1, lastColumn + 1).getValues();
  const headers = values[0] || [];
  const headerLabel = (index: number): string => {
    const value = String(headers[index] ?? '').trim();
    if (value) {
      namedHeaders.set(index, value);
      return value;
    }
    return namedHeaders.get(index) || `Column ${index + 1}`;
  };
  const columns: ValueColumn[] = [];
  const usedColumns = sourceColumns.map((source, index) => ({
    ...source,
    index,
  }));
  for (let index = sourceColumns.length; index <= lastColumn; index++) {
    const heading = String(headers[index] ?? '').trim();
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
        headerLabels.map((label, index) => {
          const kind = props.data.columns.find(
            (column) => column.key === usedColumns[index].key,
          )?.kind;
          const tint =
            kind === 'parameter'
              ? '--parameter-soft'
              : kind === 'metric'
                ? '--metric-soft'
                : '--soft';
          const ink =
            kind === 'parameter' ? '--parameter' : kind === 'metric' ? '--metric' : '--text';
          return [
            index,
            {
              text: label,
              textAlign: 'left' as const,
              fontFamily: 'IBM Plex',
              fontSize: 13,
              fontColor: dark.value ? '#111111' : sheetColor(ink),
              backgroundColor: dark.value ? '#e9e9e9' : sheetColor(tint),
              borderColor: dark.value ? '#c8c8c8' : sheetColor('--column-line'),
            },
          ];
        }),
      ),
    });
    displayedHeaders = nextHeaders;
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

function nextEmptyColumn(): number {
  if (!sheet) return sourceColumns.length;
  for (let index = sourceColumns.length; index < sheet.getMaxColumns(); index++) {
    const range = sheet.getRange(0, index, sourceRowCount + 1, 1);
    const occupied = range
      .getValues()
      .some((row) => row[0] !== null && row[0] !== undefined && row[0] !== '');
    const hasFormula = range.getFormulas().some((row) => Boolean(row[0]));
    if (!occupied && !hasFormula) return index;
  }
  return sheet.getMaxColumns();
}

async function addCalculatedColumn(): Promise<void> {
  if (!sheet || addingColumn.value) return;
  const name = columnName.value.trim();
  const expression = columnFormula.value.trim();
  if (!name || !expression) {
    columnError.value = 'Enter a column name and a formula.';
    return;
  }
  if (!sourceRowCount) {
    columnError.value = 'There are no data rows to calculate.';
    return;
  }
  const formula = expression.startsWith('=') ? expression : `=${expression}`;
  // In a calculated column, a whole-column reference means the cell in the current row.
  const firstFormula = formula.replace(/\b([A-Z]+):\1\b/gi, (_, column: string) => `${column}2`);
  const index = nextEmptyColumn();
  addingColumn.value = true;
  columnError.value = '';
  try {
    if (index >= sheet.getMaxColumns()) sheet.setColumnCount(index + 12);
    sheet.getRange(0, index).setValue(name);
    sheet.setColumnWidth(index, 160);
    const firstCell = sheet.getRange(1, index);
    firstCell.setFormula(firstFormula);
    if (sourceRowCount > 1) {
      const filled = await firstCell.autoFill(sheet.getRange(1, index, sourceRowCount, 1));
      if (!filled) throw new Error('Could not fill the formula down the column.');
    }
    namedHeaders.set(index, name);
    columnName.value = '';
    columnFormula.value = '';
    scheduleSnapshot();
  } catch (cause) {
    sheet.getRange(0, index, sourceRowCount + 1, 1).clearContent();
    columnError.value = cause instanceof Error ? cause.message : 'Could not add the column.';
  } finally {
    addingColumn.value = false;
  }
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
    displayedHeaders = '';
    snapshot();
  } catch {
    if (attempt < 10) headerTimer = window.setTimeout(() => presentHeaders(attempt + 1), 100);
  }
}

watch(dark, (enabled) => {
  api?.toggleDarkMode(enabled);
  sheet?.setDefaultStyle({ ff: 'IBM Plex', fs: 11, cl: { rgb: canvasColor(colors.value.text) } });
  styleHeaderRow();
  if (headersReady) presentHeaders();
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
    cellData[0] = Object.fromEntries(
      sourceColumns.map((column, index) => [index, { v: column.label }]),
    );
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
    sheet.setDefaultStyle({ ff: 'IBM Plex', fs: 11, cl: { rgb: canvasColor(colors.value.text) } });
    sheet.setRowHeight(0, 24);
    styleHeaderRow();
    sheet.setFreeze({ startRow: 1, startColumn: 0, xSplit: 0, ySplit: 1 });
    sourceColumns.forEach((_, index) => sheet?.setColumnWidth(index, 160));
    if (sourceRowCount) sheet.getRange(0, 0, sourceRowCount + 1, columnCount).createFilter();
    subscriptions = [
      api.addEvent(api.Event.SheetValueChanged, scheduleSnapshot),
      api.addEvent(api.Event.SheetRangeFiltered, scheduleSnapshot),
      api.addEvent(api.Event.SheetRangeFilterCleared, scheduleSnapshot),
      api.addEvent(api.Event.SheetRangeSorted, scheduleSnapshot),
      api.addEvent(api.Event.SheetSkeletonChanged, scheduleSnapshot),
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
    <form class="calculated-column-form" @submit.prevent="addCalculatedColumn">
      <input v-model="columnName" aria-label="New column name" placeholder="Column name" />
      <input
        v-model="columnFormula"
        aria-label="New column formula"
        placeholder="Formula, e.g. =SQRT(P2)"
      />
      <button type="submit" :disabled="addingColumn">Add column</button>
      <span v-if="columnError" class="calculated-column-error" role="alert">{{ columnError }}</span>
    </form>
    <div v-if="error" class="analysis-state error">{{ error }}</div>
    <div
      ref="container"
      class="values-spreadsheet-editor"
      aria-label="Run values spreadsheet"
    ></div>
  </div>
</template>
