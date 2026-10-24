/**
 * M3 acceptance demo (TASKS M3, HANDOFF §6A).
 *
 * One end-to-end scenario that walks the milestone acceptance script:
 *
 * 1. apply the four builtin templates to the same view and assert the visual
 *    contract (row height, colours, font family, zebra, alignment);
 * 2. edit the style in the real editor: density, header colour and the
 *    `sensor_a` column override (label, width, one decimal); the 50-row preview
 *    must update within 100 ms and one control must equal one undo entry;
 * 3. add the “high temperature” conditional rule (`sensor_a > 30` → red row +
 *    warning icon) and assert hit/miss rows;
 * 4. save the draft as a template, filter/sort/freeze the view, set the template
 *    as the workspace default and export the current result as CSV;
 * 5. quit, import the exported `.curvestyle.json` into a second workspace,
 *    apply it and compare twelve computed style values plus the second CSV;
 * 6. quit again, reopen both workspaces and assert the template, view reference,
 *    filter/sort, widths, frozen columns and workspace default were restored.
 *
 * Workspaces are seeded through `window.api` so both sides share the same
 * schema and rows (the T3.5 pattern); every style/template/export step below is
 * driven through the UI. The app is launched three times via `launchCurveApp`
 * because the scenario spans quits and a cross-workspace round trip. Production
 * code is not involved in the restarts.
 */

import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { launchCurveApp, test } from './fixtures';

import type { LaunchedCurveApp } from './fixtures';
import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { Locator, Page, TestInfo } from '@playwright/test';

const SOURCE_NAME = 'M3 Source';
const TARGET_NAME = 'M3 Target';
const TABLE_NAME = 'Readings';
const STYLE_NAME = 'M3 Report';
const TABLE_ID = 'tbl_m3';
const VIEW_ID = 'viw_m3';
const PREVIEW_MAX_MS = 100;

const COL = {
  id: 'col_id',
  sensor: 'col_sensor',
  day: 'col_day',
  active: 'col_active',
  status: 'col_status',
  note: 'col_note',
} as const;

type Column = WorkspaceManifest['tables'][number]['columns'][number];
type TableView = NonNullable<WorkspaceManifest['views'][number]['tableView']>;
type TableStyle = WorkspaceManifest['tableStyles'][number];
type Cell = string | number | boolean | null;

const COLUMNS: Column[] = [
  {
    id: COL.id,
    key: 'id',
    label: 'ID',
    type: 'text',
    role: 'none',
    required: true,
  },
  {
    id: COL.sensor,
    key: 'sensor_a',
    label: 'Sensor',
    type: 'number',
    role: 'y',
    precision: 2,
  },
  { id: COL.day, key: 'day', label: 'Day', type: 'date', role: 'x' },
  { id: COL.active, key: 'active', label: 'Active', type: 'boolean', role: 'none' },
  {
    id: COL.status,
    key: 'status',
    label: 'Status',
    type: 'enum',
    role: 'none',
    enumOptions: [
      { value: 'open', label: 'Open' },
      { value: 'paused', label: 'Paused' },
      { value: 'closed', label: 'Closed' },
    ],
  },
  { id: COL.note, key: 'note', label: 'Note', type: 'text', role: 'none' },
];

const DAY = Date.UTC(2026, 1, 1, 12, 0, 0);

/**
 * Six rows spanning the `> 30` rule boundary and the CSV escaping cases
 * (comma, quote, embedded LF, padded text, Chinese). Values above 20 keep four
 * rows in the filtered export: r3, r2, r5, r4.
 */
const ROWS: Cell[][] = [
  ['r1', 12.5, DAY, true, 'open', 'Alpha'],
  ['r2', 45.2, DAY + 86_400_000, false, 'paused', 'Say "hi"'],
  ['r3', 78.9, DAY + 172_800_000, true, 'closed', 'Line1\nLine2'],
  ['r4', 22.1, DAY + 259_200_000, false, 'open', 'Alice, A.'],
  ['r5', 30, DAY + 345_600_000, true, 'paused', ' padded '],
  ['r6', 5.4, DAY + 432_000_000, false, 'closed', '中文, 逗号'],
];

const VISIBLE_ROWS = 4;
const HOT_ROW_IDS = ['r2', 'r3'] as const;
const COOL_ROW_IDS = ['r1', 'r4', 'r5', 'r6'] as const;

// The twelve computed values compared between the source workspace and the
// imported template in the target workspace (HANDOFF §6A step 5).
interface StyleContract {
  headerBg: string;
  bodyBg: string;
  alternateBg: string;
  rowHeight: string;
  fontFamily: string;
  radius: string;
  headerLabel: string;
  headerWidth: number;
  numberText: string;
  dateText: string;
  boolText: string;
  ruleBackground: string;
}

interface RowSnapshot {
  texts: Record<string, string>;
  rules: Record<string, string | null>;
  backgrounds: Record<string, string>;
  icon: string | null;
}

function readManifest(root: string): WorkspaceManifest {
  return JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as WorkspaceManifest;
}

function tableViewOf(manifest: WorkspaceManifest): TableView {
  const view = manifest.views[0];
  if (view === undefined || view.tableView === undefined) {
    throw new Error('workspace has no table view');
  }
  return view.tableView;
}

function styleOf(root: string): TableStyle | undefined {
  const manifest = readManifest(root);
  const styleId = tableViewOf(manifest).styleId;
  return manifest.tableStyles.find((style) => style.id === styleId);
}

function userStyles(root: string): TableStyle[] {
  return readManifest(root).tableStyles;
}

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function countJsonlRows(path: string): number {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0).length;
}

async function seedWorkspace(page: Page, dir: string, name: string): Promise<string> {
  const root = await page.evaluate(
    async (seed) => {
      const api = (globalThis as unknown as { api: CurveApi }).api;
      const created = await api.workspace.create({ dir: seed.dir, name: seed.name });
      if (!created.ok) {
        throw new Error(`create failed: ${created.error.code}`);
      }
      const manifest = created.data;
      const timestamp = manifest.createdAt;
      const jsonl = `${seed.rows
        .map((values, index) => JSON.stringify({ id: `row_m3_${String(index + 1)}`, v: values }))
        .join('\n')}\n`;
      const columns: Column[] = seed.columns;
      const next: WorkspaceManifest = {
        ...manifest,
        updatedAt: timestamp,
        tables: [
          {
            id: seed.tableId,
            name: seed.tableName,
            file: `tables/${seed.tableId}.jsonl`,
            schemaVersion: 1,
            columns,
            primaryKey: columns[0]?.id ?? 'col_id',
            rowCount: seed.rows.length,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        views: [
          {
            id: seed.viewId,
            kind: 'table',
            refId: seed.tableId,
            title: seed.tableName,
            tableView: {
              tableId: seed.tableId,
              styleId: 'builtin.report-light',
              columnOrder: columns.map((column) => column.id),
              widths: {},
              hiddenColumnIds: [],
              sort: [],
              frozenColumnCount: 0,
            },
          },
        ],
        layout: { type: 'pane', viewIds: [seed.viewId], activeViewId: seed.viewId },
      };
      const written = await api.manifest.write({ workspaceId: manifest.id, manifest: next });
      if (!written.ok) {
        throw new Error(`manifest write failed: ${written.error.code}`);
      }
      const tableWrite = await api.table.write({
        workspaceId: manifest.id,
        tableId: seed.tableId,
        jsonl,
      });
      if (!tableWrite.ok) {
        throw new Error(`table write failed: ${tableWrite.error.code}`);
      }
      const closed = await api.workspace.close({ workspaceId: manifest.id });
      if (!closed.ok) {
        throw new Error(`close failed: ${closed.error.code}`);
      }
      return `${seed.dir}\\${seed.name}.cstudio`;
    },
    {
      dir,
      name,
      tableId: TABLE_ID,
      viewId: VIEW_ID,
      tableName: TABLE_NAME,
      columns: COLUMNS,
      rows: ROWS,
    },
  );
  return root;
}

async function dismissWarnings(page: Page): Promise<void> {
  const warnings = page.locator('.cs-warnings');
  if ((await warnings.count()) === 0) {
    return;
  }
  const hide = warnings.getByRole('button', { name: '隐藏提示' });
  if ((await hide.count()) > 0) {
    await hide.first().click();
  }
  await expect(warnings).toHaveCount(0);
}

async function openWorkspace(page: Page, name: string): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: name }).first().click();
  await expect(page.getByTestId('data-grid')).toBeVisible();
  await dismissWarnings(page);
}

async function openStyleTab(page: Page): Promise<void> {
  await page.getByTestId('inspector').getByRole('tab', { name: '样式' }).click();
  await expect(page.getByTestId('style-panel')).toBeVisible();
}

async function openManager(page: Page): Promise<void> {
  await page.getByTestId('style-templates-open').click();
  await expect(page.getByRole('dialog', { name: '模板管理' })).toBeVisible();
}

async function closeManager(page: Page): Promise<void> {
  await page.getByTestId('style-templates-close').click();
  await expect(page.getByRole('dialog', { name: '模板管理' })).toHaveCount(0);
}

async function openEditor(page: Page): Promise<void> {
  await page.getByTestId('style-edit-open').click();
  await expect(page.getByTestId('style-editor')).toBeVisible();
}

async function closeEditor(page: Page): Promise<void> {
  await page.getByTestId('style-done').click();
  await expect(page.getByTestId('style-editor')).toHaveCount(0);
}

function headerOf(page: Page, columnId: string): Locator {
  return page.locator(`[role="columnheader"][data-column-id="${columnId}"]`);
}

async function capture(target: Page | Locator, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(name);
  await target.screenshot({ path });
  await testInfo.attach(name.replace(/\.png$/u, ''), { path, contentType: 'image/png' });
}

interface GridStyle {
  backgroundColor: string;
  color: string;
  fontSize: string;
  fontFamily: string;
  fontWeight: string;
  justifyContent: string;
  height: number;
}

async function computedStyleOf(page: Page, selector: string): Promise<GridStyle> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        color: style.color,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight,
        justifyContent: style.justifyContent,
        height: element.getBoundingClientRect().height,
      };
    });
}

async function computedStyle(page: Page, testId: string): Promise<GridStyle> {
  return computedStyleOf(page, `[data-testid="${testId}"]`);
}

function matchesStyle(actual: GridStyle, expected: Partial<GridStyle>): boolean {
  const record = actual as unknown as Record<string, unknown>;
  return Object.entries(expected).every(([key, value]) => record[key] === value);
}

/**
 * The grid settles one frame after `data-table-style` flips (the virtualized
 * row height is re-measured from the new tokens), so computed values are polled
 * instead of read once.
 */
async function expectCellStyle(
  page: Page,
  testId: string,
  expected: Partial<GridStyle>,
): Promise<GridStyle> {
  const selector = `[data-testid="${testId}"]`;
  await expect
    .poll(async () => matchesStyle(await computedStyleOf(page, selector), expected))
    .toBe(true);
  return computedStyleOf(page, selector);
}

async function expectHeaderStyle(page: Page, expected: Partial<GridStyle>): Promise<GridStyle> {
  await expect
    .poll(async () => matchesStyle(await computedStyleOf(page, '.cs-grid__header-cell'), expected))
    .toBe(true);
  return computedStyleOf(page, '.cs-grid__header-cell');
}

/** Reads one rendered grid row by its id cell, stripping the rule icon glyph. */
async function readRow(page: Page, rowId: string): Promise<RowSnapshot> {
  const snapshot = await page.evaluate((wanted) => {
    const textOf = (cell: HTMLElement): string => {
      const clone = cell.cloneNode(true) as HTMLElement;
      for (const icon of Array.from(clone.querySelectorAll('.cs-grid__rule-icon'))) {
        icon.remove();
      }
      return (clone.textContent ?? '').trim();
    };
    const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="grid-row-"]'));
    for (const row of rows) {
      const cells = Array.from(row.querySelectorAll<HTMLElement>('.cs-grid__cell[data-column-id]'));
      const idCell = cells.find((cell) => cell.getAttribute('data-column-id') === 'col_id');
      if (idCell === undefined || textOf(idCell) !== wanted) {
        continue;
      }
      const texts: Record<string, string> = {};
      const rules: Record<string, string | null> = {};
      const backgrounds: Record<string, string> = {};
      for (const cell of cells) {
        const columnId = cell.getAttribute('data-column-id') ?? '';
        texts[columnId] = textOf(cell);
        rules[columnId] = cell.getAttribute('data-conditional-rule');
        backgrounds[columnId] = getComputedStyle(cell).backgroundColor;
      }
      const icon = row.querySelector<HTMLElement>('.cs-grid__rule-icon');
      return { texts, rules, backgrounds, icon: icon?.getAttribute('data-icon') ?? null };
    }
    return null;
  }, rowId);
  if (snapshot === null) {
    throw new Error(`row ${rowId} is not rendered`);
  }
  return snapshot;
}

async function readStyleContract(page: Page): Promise<StyleContract> {
  const vars = await page.getByTestId('data-grid').evaluate((element) => {
    const style = getComputedStyle(element);
    const read = (name: string): string => style.getPropertyValue(name).trim();
    return {
      headerBg: read('--cs-table-header-bg'),
      bodyBg: read('--cs-table-body-bg'),
      alternateBg: read('--cs-table-body-alt-bg'),
      rowHeight: read('--cs-table-row-height'),
      fontFamily: read('--cs-table-font-family'),
      radius: read('--cs-table-radius'),
    };
  });
  const header = headerOf(page, COL.sensor);
  const box = await header.boundingBox();
  const hot = await readRow(page, 'r3');
  const rule = await readRow(page, 'r2');
  return {
    ...vars,
    // The sort indicator lives next to the label, so read the label span.
    headerLabel: (await header.locator('.cs-grid__header-label').textContent())?.trim() ?? '',
    headerWidth: box?.width ?? 0,
    numberText: hot.texts[COL.sensor] ?? '',
    dateText: hot.texts[COL.day] ?? '',
    boolText: hot.texts[COL.active] ?? '',
    ruleBackground: rule.backgrounds[COL.sensor] ?? '',
  };
}

async function applyBuiltin(page: Page, root: string, styleId: string): Promise<void> {
  await openManager(page);
  await page.getByTestId(`style-template-apply-${styleId}`).click();
  await expect(page.getByTestId('style-template-status')).toContainText('应用到当前视图');
  await expect.poll(() => tableViewOf(readManifest(root)).styleId).toBe(styleId);
  await closeManager(page);
  const grid = page.getByTestId('data-grid');
  await expect(grid).toHaveAttribute('data-table-style', styleId);
  await expect(grid).not.toHaveAttribute('data-style-fallback', 'true');
}

async function waitForSaved(page: Page): Promise<void> {
  await expect(page.getByTestId('autosave-status')).toContainText('已保存', { timeout: 20_000 });
}

test.describe('M3 acceptance demo', () => {
  test('templates, style editing, conditional rule, CSV export, cross-workspace import and restore', async ({
    userDataDir,
  }, testInfo) => {
    test.setTimeout(300_000);

    const parent = testInfo.outputPath('m3-parent');
    mkdirSync(parent, { recursive: true });
    const sourceRoot = join(parent, `${SOURCE_NAME}.cstudio`);
    const targetRoot = join(parent, `${TARGET_NAME}.cstudio`);
    // The E2E save stub is a single path per launch: the source launch exports
    // the template first (copied aside) and then the CSV, which overwrites it.
    const workPath = join(userDataDir, 'm3-work');
    const stylePath = join(parent, 'm3-report.curvestyle.json');
    const targetCsvPath = join(userDataDir, 'm3-target.csv');
    const unusedImport = join(parent, 'unused.json');

    let first: LaunchedCurveApp | undefined;
    let second: LaunchedCurveApp | undefined;
    let third: LaunchedCurveApp | undefined;
    let sourceContract: StyleContract | null = null;
    let sourceStyleId = '';
    let importedStyleId = '';
    let previewMs = 0;
    let noteWidth = 0;
    const metrics: Record<string, string | number> = {};

    try {
      // ------------------------------------------------------------------
      // Launch 1 — source workspace: templates, style edits, rule, export.
      // ------------------------------------------------------------------
      first = await launchCurveApp({ userDataDir, importFile: unusedImport, saveFile: workPath });
      const page = first.page;
      await expect(page.getByTestId('welcome')).toBeVisible();
      expect(await seedWorkspace(page, parent, SOURCE_NAME)).toBe(sourceRoot);
      expect(await seedWorkspace(page, parent, TARGET_NAME)).toBe(targetRoot);
      await openWorkspace(page, SOURCE_NAME);
      await expect(page.getByTestId('workspace-label')).toHaveText(SOURCE_NAME);
      await expect(page.getByRole('grid')).toHaveAttribute(
        'aria-rowcount',
        String(ROWS.length + 1),
      );
      await openStyleTab(page);
      await expect(page.getByTestId('style-current-name')).toHaveText('报告（浅）');

      // 1. Apply the four builtin templates to the same view and record the
      //    distinct visual contract of each.
      await applyBuiltin(page, sourceRoot, 'builtin.report-light');
      await expectCellStyle(page, 'grid-cell-0-1', { height: 32, justifyContent: 'flex-end' });
      await expect(page.getByTestId('grid-cell-0-1')).toHaveText('12.50');
      await capture(page.getByTestId('data-grid'), testInfo, 'm3-01-report-light.png');

      await applyBuiltin(page, sourceRoot, 'builtin.compact-light');
      await expectCellStyle(page, 'grid-cell-0-1', { height: 24 });
      await expectHeaderStyle(page, { fontSize: '12px' });
      await capture(page.getByTestId('data-grid'), testInfo, 'm3-02-compact-light.png');

      await applyBuiltin(page, sourceRoot, 'builtin.dark');
      await expectCellStyle(page, 'grid-cell-0-1', { backgroundColor: 'rgb(30, 30, 30)' });
      await expectHeaderStyle(page, { backgroundColor: 'rgb(37, 37, 38)' });
      await capture(page.getByTestId('data-grid'), testInfo, 'm3-03-dark.png');

      await applyBuiltin(page, sourceRoot, 'builtin.finance');
      await expectHeaderStyle(page, { backgroundColor: 'rgb(31, 41, 55)' });
      await expect
        .poll(async () => (await computedStyle(page, 'grid-cell-0-1')).fontFamily)
        .toContain('Cascadia Mono');
      const financeCell = await computedStyle(page, 'grid-cell-0-1');
      const financeAlternate = await computedStyle(page, 'grid-cell-1-1');
      expect(financeCell.justifyContent).toBe('flex-end');
      expect(financeAlternate.backgroundColor).not.toBe(financeCell.backgroundColor);
      await capture(page.getByTestId('data-grid'), testInfo, 'm3-04-finance.png');

      // 2. Edit density, header colour and the sensor column in the real
      //    editor; the preview must follow within 100 ms.
      await openEditor(page);
      expect(userStyles(sourceRoot)).toHaveLength(0);
      const preview = page.getByTestId('style-preview');
      await expect(preview).toHaveAttribute('data-preview-rows', String(ROWS.length));
      await expect(page.getByTestId('preview-cell-0-1')).toHaveText('12.50');

      await page.getByTestId('style-density').selectOption('compact');
      await expect.poll(() => styleOf(sourceRoot)?.tokens.density).toBe('compact');
      await expect
        .poll(async () => (await preview.getAttribute('data-preview-ms')) ?? '')
        .not.toBe('');
      previewMs = Number(await preview.getAttribute('data-preview-ms'));
      expect(previewMs, `preview took ${String(previewMs)}ms`).toBeLessThanOrEqual(PREVIEW_MAX_MS);
      const editedStyle = styleOf(sourceRoot);
      expect(editedStyle?.builtin).toBe(false);
      expect(editedStyle?.id.startsWith('sty_')).toBe(true);

      const headerBackground = page.getByLabel('表头背景');
      await headerBackground.fill('#123456');
      await headerBackground.press('Enter');
      await expect.poll(() => styleOf(sourceRoot)?.tokens.header.background).toBe('#123456');

      await page.getByRole('tab', { name: '列覆盖' }).click();
      const columnDetails = page.getByTestId(`style-column-${COL.sensor}`);
      await columnDetails.locator('summary').click();
      await columnDetails.getByLabel('显示名称').fill('Sensor A');
      await columnDetails.getByLabel('显示名称').press('Enter');
      await expect
        .poll(() => styleOf(sourceRoot)?.columnOverrides[COL.sensor]?.label)
        .toBe('Sensor A');

      await columnDetails.getByLabel('列宽（px）').fill('180');
      await columnDetails.getByLabel('列宽（px）').press('Enter');
      await expect.poll(() => styleOf(sourceRoot)?.columnOverrides[COL.sensor]?.width).toBe(180);

      await columnDetails.getByLabel('小数位').fill('1');
      await columnDetails.getByLabel('小数位').press('Enter');
      await expect
        .poll(() => styleOf(sourceRoot)?.columnOverrides[COL.sensor]?.numberFormat)
        .toMatchObject({ style: 'decimal', digits: 1 });
      await expect(page.getByTestId('preview-cell-0-1')).toHaveText('12.5');
      await capture(
        page.getByRole('dialog', { name: '样式编辑器' }),
        testInfo,
        'm3-05-style-editor.png',
      );
      await closeEditor(page);

      // One committed control = one undo entry: the last commit (one decimal)
      // reverts alone, then redo restores it.
      await page.keyboard.press('Control+z');
      await expect(page.getByTestId('grid-cell-0-1')).toHaveText('12.50');
      await expect(page.getByTestId('style-panel')).toContainText('自定义样式');
      await page.keyboard.press('Control+Shift+z');
      await expect(page.getByTestId('grid-cell-0-1')).toHaveText('12.5');
      await expect(headerOf(page, COL.sensor)).toHaveText('Sensor A');

      // 3. Conditional rule: `sensor_a > 30` → red row + warning icon.
      await openEditor(page);
      await page.getByRole('tab', { name: '条件规则' }).click();
      await page.getByTestId('style-rule-add').click();
      await page.getByTestId('style-rule-label').fill('高温');
      await page.getByTestId('style-rule-condition-0-0-column').selectOption(COL.sensor);
      await page.getByTestId('style-rule-condition-0-0-op').selectOption('gt');
      await page.getByTestId('style-rule-condition-0-0-value').fill('30');
      const ruleEditor = page.getByTestId('style-rules-tab');
      await ruleEditor.getByLabel('背景色').fill('#fde2e2');
      await ruleEditor.getByLabel('文字色').fill('#a40000');
      await ruleEditor.getByLabel('图标').selectOption('warning');
      await ruleEditor.getByLabel('加粗').check();
      await page.getByTestId('style-rule-save').click();
      await expect.poll(() => styleOf(sourceRoot)?.conditionalRules.length).toBe(1);
      const rule = styleOf(sourceRoot)?.conditionalRules[0];
      expect(rule?.label).toBe('高温');
      expect(rule?.when).toMatchObject({
        kind: 'all',
        children: [{ kind: 'compare', columnId: COL.sensor, op: 'gt', value: 30 }],
      });
      expect(rule?.style).toMatchObject({
        background: '#fde2e2',
        foreground: '#a40000',
        icon: 'warning',
        bold: true,
      });

      // The rule also decorates the preview (row 1 = r2, 45.2).
      const previewHot = page.getByTestId('preview-cell-1-0');
      await expect(previewHot).toHaveAttribute('data-conditional-rule', /^rule_/u);
      expect(
        await previewHot.evaluate((element) => getComputedStyle(element).backgroundColor),
      ).toBe('rgb(253, 226, 226)');

      // 4. Save the draft as a template; the view follows the new copy.
      await page.getByRole('tab', { name: '模板' }).click();
      await page.getByTestId('style-save-as-open').click();
      await page.getByTestId('style-save-as-name').fill(STYLE_NAME);
      await page.getByTestId('style-save-as-confirm').click();
      await expect(page.getByTestId('style-save-as-notice')).toContainText(STYLE_NAME);
      await expect.poll(() => userStyles(sourceRoot).length).toBe(2);
      const saved = userStyles(sourceRoot).find((style) => style.name === STYLE_NAME);
      expect(saved).toBeDefined();
      sourceStyleId = saved?.id ?? '';
      const savedRule = saved?.conditionalRules[0];
      expect(sourceStyleId.startsWith('sty_')).toBe(true);
      await expect.poll(() => tableViewOf(readManifest(sourceRoot)).styleId).toBe(sourceStyleId);
      await closeEditor(page);
      await expect(page.getByTestId('style-current-name')).toHaveText(STYLE_NAME);

      // Grid decorations for the rule.
      for (const rowId of HOT_ROW_IDS) {
        await expect
          .poll(async () => (await readRow(page, rowId)).rules[COL.sensor])
          .toMatch(/^rule_/u);
        const hot = await readRow(page, rowId);
        expect(hot.backgrounds[COL.sensor]).toBe('rgb(253, 226, 226)');
        expect(hot.texts[COL.sensor]).not.toBe('');
      }
      await expect.poll(async () => (await readRow(page, 'r3')).icon).toBe('warning');
      const hotRow = await readRow(page, 'r3');
      expect(hotRow.texts[COL.status]).toBe('Closed');
      expect(hotRow.texts[COL.active]).toBe('是');
      for (const rowId of COOL_ROW_IDS) {
        const cool = await readRow(page, rowId);
        expect(cool.rules[COL.sensor] ?? null).toBeNull();
      }
      await capture(page.getByTestId('data-grid'), testInfo, 'm3-06-conditional-rule.png');

      // 5a. Filter/sort the view, freeze two columns and autofit the note
      //     column so the restart has view state to restore.
      await page.getByTestId('grid-filter-open').click();
      const filterDialog = page.getByRole('dialog', { name: '筛选条件' });
      await expect(filterDialog).toBeVisible();
      await filterDialog.getByLabel('列', { exact: true }).first().selectOption(COL.sensor);
      await filterDialog.getByLabel('操作符', { exact: true }).first().selectOption('gte');
      await filterDialog.getByLabel('值', { exact: true }).first().fill('20');
      await filterDialog.getByRole('button', { name: '应用筛选' }).click();
      await expect(filterDialog).toHaveCount(0);

      const grid = page.getByTestId('data-grid');
      await expect(grid).toHaveAttribute('data-visible-rows', String(VISIBLE_ROWS));
      await expect(page.getByTestId('grid-filter-open')).toContainText('1 个条件');

      const sensorHeader = headerOf(page, COL.sensor);
      await sensorHeader.getByRole('button').click();
      await expect(sensorHeader).toHaveAttribute('aria-sort', 'ascending');
      await sensorHeader.getByRole('button').click();
      await expect(sensorHeader).toHaveAttribute('aria-sort', 'descending');
      await expect(grid).toHaveAttribute('data-visible-rows', String(VISIBLE_ROWS));

      await page.getByLabel('冻结列').selectOption('2');
      await expect.poll(() => tableViewOf(readManifest(sourceRoot)).frozenColumnCount).toBe(2);
      await expect(page.locator('.cs-grid__header-cell--frozen')).toHaveCount(2);

      const noteHeader = headerOf(page, COL.note);
      await noteHeader.getByRole('separator').dispatchEvent('dblclick');
      await expect
        .poll(() => tableViewOf(readManifest(sourceRoot)).widths?.[COL.note])
        .toBeGreaterThan(0);
      noteWidth = tableViewOf(readManifest(sourceRoot)).widths?.[COL.note] ?? 0;

      // 5b. Set the workspace default, export the template, then the CSV.
      await openManager(page);
      await page.getByTestId(`style-template-default-${sourceStyleId}`).click();
      await expect(page.getByTestId('style-template-status')).toContainText('设为工作区默认');
      await expect
        .poll(() => readManifest(sourceRoot).settings.defaultTableStyleId)
        .toBe(sourceStyleId);

      await page.getByTestId(`style-template-export-${sourceStyleId}`).click();
      await expect(page.getByTestId('style-template-status')).toContainText('已导出到');
      await expect.poll(() => existsSync(workPath)).toBe(true);
      copyFileSync(workPath, stylePath);
      const document = JSON.parse(readFileSync(stylePath, 'utf8')) as {
        kind: string;
        version: number;
        exportedAt: string;
        style: TableStyle;
      };
      expect(document.kind).toBe('curve-table-style');
      expect(document.version).toBe(1);
      expect(Number.isNaN(Date.parse(document.exportedAt))).toBe(false);
      expect(document.style.name).toBe(STYLE_NAME);
      expect(document.style.builtin).toBe(false);
      // Export is a snapshot of the persisted style: ids are kept and only the
      // import reassigns them (ADR-038).
      expect(document.style.id).toBe(sourceStyleId);
      expect(document.style.conditionalRules).toHaveLength(1);
      expect(document.style.conditionalRules[0]?.id).toBe(savedRule?.id);
      await closeManager(page);

      await page.getByTestId('grid-export-open').click();
      const exportDialog = page.getByRole('dialog', { name: '导出 CSV' });
      await expect(exportDialog).toBeVisible();
      await expect(
        exportDialog.getByText(`将导出 ${String(VISIBLE_ROWS)} 行 × 6 列。`),
      ).toBeVisible();
      await capture(exportDialog, testInfo, 'm3-07-export-dialog.png');
      await exportDialog.getByRole('button', { name: '导出', exact: true }).click();
      await expect(page.getByTestId('export-csv-done')).toBeVisible({ timeout: 15_000 });
      // The dialog has both an icon close button and the footer “关闭”; pick the
      // footer action (same as the T3.6 spec).
      await exportDialog.getByRole('button', { name: '关闭' }).last().click();

      const csvBytes = readFileSync(workPath);
      expect([...csvBytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
      const csv = csvBytes.toString('utf8');
      expect((csv.match(/\r\n/gu) ?? []).length).toBe(VISIBLE_ROWS + 1);
      const lines = csv.split('\r\n').filter((line) => line.length > 0);
      expect(lines).toHaveLength(VISIBLE_ROWS + 1);
      expect(lines[0]).toBe('\uFEFFID,Sensor A,Day,Active,Status,Note');
      expect(csv).toContain('r3,78.9,2026/02/03,是,Closed,"Line1\nLine2"');
      expect(csv).toContain('r2,45.2,2026/02/02,否,Paused,"Say ""hi"""');
      expect(csv).toContain('r5,30.0,2026/02/05,是,Paused," padded "');
      expect(csv).toContain('r4,22.1,2026/02/04,否,Open,"Alice, A."');
      expect(csv.indexOf('r3')).toBeLessThan(csv.indexOf('r2'));
      expect(csv.indexOf('r2')).toBeLessThan(csv.indexOf('r5'));
      expect(csv.indexOf('r5')).toBeLessThan(csv.indexOf('r4'));
      expect(csv).not.toContain('r1,');
      expect(csv).not.toContain('r6,');

      // 5c. Record the state that the restart must restore.
      await expect.poll(async () => (await readStyleContract(page)).numberText).toBe('78.9');
      sourceContract = await readStyleContract(page);
      expect(sourceContract.headerLabel).toBe('Sensor A');
      expect(sourceContract.headerWidth).toBeCloseTo(180, 0);
      expect(sourceContract.numberText).toBe('78.9');
      expect(sourceContract.dateText).toBe('2026/02/03');
      expect(sourceContract.boolText).toBe('是');
      expect(sourceContract.ruleBackground).toBe('rgb(253, 226, 226)');

      const manifestBefore = readManifest(sourceRoot);
      const viewBefore = tableViewOf(manifestBefore);
      expect(viewBefore.filter).toMatchObject({
        kind: 'all',
        children: [{ kind: 'compare', columnId: COL.sensor, op: 'gte', value: 20 }],
      });
      expect(viewBefore.sort).toEqual([{ columnId: COL.sensor, direction: 'desc' }]);
      expect(viewBefore.frozenColumnCount).toBe(2);
      expect(viewBefore.widths?.[COL.note]).toBe(noteWidth);
      expect(manifestBefore.settings.defaultTableStyleId).toBe(sourceStyleId);
      expect(manifestBefore.tableStyles.map((style) => style.name)).toContain(STYLE_NAME);

      const jsonlPath = join(sourceRoot, 'tables', `${TABLE_ID}.jsonl`);
      expect(countJsonlRows(jsonlPath)).toBe(ROWS.length);
      const jsonlHash = sha256File(jsonlPath);
      await expect(page.getByTestId('style-current-name')).toHaveText(STYLE_NAME);
      await waitForSaved(page);
      await capture(page.getByTestId('data-grid'), testInfo, 'm3-08-source-final.png');

      Object.assign(metrics, {
        sourceStyleId,
        previewMs,
        filteredRows: VISIBLE_ROWS,
        noteWidth,
        jsonlSha256: jsonlHash,
        sourceCsvBytes: csvBytes.byteLength,
      });

      await first.electronApp.close();
      first = undefined;

      // ------------------------------------------------------------------
      // Launch 2 — target workspace: import the template, apply, compare.
      // ------------------------------------------------------------------
      second = await launchCurveApp({
        userDataDir,
        importFile: stylePath,
        saveFile: targetCsvPath,
      });
      const targetPage = second.page;
      await openWorkspace(targetPage, TARGET_NAME);
      const targetGrid = targetPage.getByTestId('data-grid');
      await expect(targetGrid).toHaveAttribute('data-table-style', 'builtin.report-light');
      await openStyleTab(targetPage);
      await openManager(targetPage);
      await targetPage.getByTestId('style-template-import').click();
      await expect(targetPage.getByTestId('style-import-dialog')).toBeVisible();
      await targetPage.getByTestId('style-import-pick').click();
      await expect(targetPage.getByTestId('style-import-summary')).toContainText(STYLE_NAME);
      await capture(
        targetPage.getByRole('dialog', { name: '导入表格样式' }),
        testInfo,
        'm3-09-import-dialog.png',
      );
      await targetPage.getByTestId('style-import-confirm').click();

      await expect.poll(() => userStyles(targetRoot).length).toBe(1);
      const imported = userStyles(targetRoot)[0];
      expect(imported).toBeDefined();
      importedStyleId = imported?.id ?? '';
      expect(importedStyleId.startsWith('sty_')).toBe(true);
      expect(importedStyleId).not.toBe(sourceStyleId);
      expect(imported?.name).toBe(STYLE_NAME);
      expect(imported?.conditionalRules).toHaveLength(1);
      expect(imported?.conditionalRules[0]?.id).not.toBe(savedRule?.id);
      await expect.poll(() => tableViewOf(readManifest(targetRoot)).styleId).toBe(importedStyleId);
      // Confirming the import closes both the import dialog and the manager.
      await expect(targetPage.getByTestId('style-import-dialog')).toHaveCount(0);
      await expect(targetPage.getByRole('dialog', { name: '模板管理' })).toHaveCount(0);
      await expect(targetGrid).toHaveAttribute('data-table-style', importedStyleId);

      await expect
        .poll(async () => (await readStyleContract(targetPage)).headerLabel)
        .toBe('Sensor A');
      const importedContract = await readStyleContract(targetPage);
      if (sourceContract === null) {
        throw new Error('the source style contract was not captured');
      }
      expect(importedContract).toEqual(sourceContract);
      await expect.poll(async () => (await readRow(targetPage, 'r3')).icon).toBe('warning');
      const importedHot = await readRow(targetPage, 'r3');
      expect(importedHot.rules[COL.sensor]).toMatch(/^rule_/u);

      await targetPage.getByTestId('grid-export-open').click();
      const targetExportDialog = targetPage.getByRole('dialog', { name: '导出 CSV' });
      await expect(
        targetExportDialog.getByText(`将导出 ${String(ROWS.length)} 行 × 6 列。`),
      ).toBeVisible();
      await targetExportDialog.getByRole('button', { name: '导出', exact: true }).click();
      await expect(targetPage.getByTestId('export-csv-done')).toBeVisible({ timeout: 15_000 });
      await targetExportDialog.getByRole('button', { name: '关闭' }).last().click();

      const targetCsv = readFileSync(targetCsvPath, 'utf8');
      expect(targetCsv.startsWith('\uFEFF')).toBe(true);
      expect((targetCsv.match(/\r\n/gu) ?? []).length).toBe(ROWS.length + 1);
      expect(targetCsv).toContain('r1,12.5,2026/02/01,是,Open,Alpha');
      expect(targetCsv).toContain('r3,78.9,2026/02/03,是,Closed,"Line1\nLine2"');
      expect(targetCsv).toContain('"中文, 逗号"');
      expect(targetCsv.indexOf('r1')).toBeLessThan(targetCsv.indexOf('r6'));

      Object.assign(metrics, {
        importedStyleId,
        targetCsvBytes: Buffer.byteLength(targetCsv),
      });

      await second.electronApp.close();
      second = undefined;

      // ------------------------------------------------------------------
      // Launch 3 — restart: both workspaces restore their style state.
      // ------------------------------------------------------------------
      third = await launchCurveApp({ userDataDir, importFile: stylePath });
      const restorePage = third.page;
      await openWorkspace(restorePage, SOURCE_NAME);
      const restoreGrid = restorePage.getByTestId('data-grid');
      await expect(restoreGrid).toHaveAttribute('data-table-style', sourceStyleId);
      await expect(restoreGrid).toHaveAttribute('data-visible-rows', String(VISIBLE_ROWS));
      await expect(restorePage.getByTestId('grid-filter-open')).toContainText('1 个条件');
      const restoredSensorHeader = headerOf(restorePage, COL.sensor);
      await expect(restoredSensorHeader).toHaveAttribute('aria-sort', 'descending');
      await expect(restorePage.locator('.cs-grid__header-cell--frozen')).toHaveCount(2);
      const restoredNoteWidth = Math.round(
        Number.parseFloat(
          await headerOf(restorePage, COL.note).evaluate(
            (element) => getComputedStyle(element).width,
          ),
        ),
      );
      expect(restoredNoteWidth).toBe(noteWidth);
      await expect.poll(async () => (await readRow(restorePage, 'r2')).icon).toBe('warning');
      const restoredHot = await readRow(restorePage, 'r2');
      expect(restoredHot.rules[COL.sensor]).toMatch(/^rule_/u);

      await openStyleTab(restorePage);
      await expect(restorePage.getByTestId('style-current-name')).toHaveText(STYLE_NAME);
      await openManager(restorePage);
      await expect(restorePage.getByTestId(`style-template-${sourceStyleId}`)).toHaveAttribute(
        'data-default',
        'true',
      );
      await expect(restorePage.getByTestId(`style-template-${sourceStyleId}`)).toHaveAttribute(
        'data-current',
        'true',
      );
      await closeManager(restorePage);
      await capture(restorePage.getByTestId('data-grid'), testInfo, 'm3-10-restored.png');

      // Switch to the target workspace and confirm the imported template is
      // still persisted and applied.
      await restorePage.getByRole('button', { name: '关闭工作区' }).click();
      await expect(restorePage.getByTestId('welcome')).toBeVisible();
      await openWorkspace(restorePage, TARGET_NAME);
      await expect(restorePage.getByTestId('data-grid')).toHaveAttribute(
        'data-table-style',
        importedStyleId,
      );
      await openStyleTab(restorePage);
      await expect(restorePage.getByTestId('style-current-name')).toHaveText(STYLE_NAME);
      const persistedTarget = readManifest(targetRoot);
      expect(persistedTarget.tableStyles).toHaveLength(1);
      expect(persistedTarget.tableStyles[0]?.name).toBe(STYLE_NAME);
      expect(tableViewOf(persistedTarget).styleId).toBe(importedStyleId);

      const summary = Object.entries(metrics)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join('\n');
      console.log(`[m3] ${summary.replaceAll('\n', ' ')}`);
      await testInfo.attach('m3-metrics.txt', { body: `${summary}\n`, contentType: 'text/plain' });
      await testInfo.attach('m3-contract.json', {
        body: JSON.stringify({ source: sourceContract, imported: importedContract }, null, 2),
        contentType: 'application/json',
      });
    } finally {
      await third?.electronApp.close().catch(() => undefined);
      await second?.electronApp.close().catch(() => undefined);
      await first?.electronApp.close().catch(() => undefined);
    }
  });
});
