import { expect } from '@playwright/test';

import { test } from './fixtures';

import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { Page, TestInfo } from '@playwright/test';

/**
 * T3.2 — the four builtin templates rendered by the real grid.
 *
 * The workspace is seeded through `window.api` with one table and four views,
 * each pointing at a builtin style. The test asserts the computed contract
 * (colours, row height, alignment, formatting, zebra) and attaches one grid
 * screenshot per template as visual evidence. Pixel equality is deliberately
 * not asserted: the E2E suite runs on Windows at 125% DPI and screenshots are
 * not stable byte-for-byte (see HANDOFF §3.6).
 */

const SEED_NAME = 'Style Demo';

async function seedStyleWorkspace(page: Page, testInfo: TestInfo): Promise<void> {
  const parent = testInfo.outputPath('style-parent');
  const result = await page.evaluate(
    async ({ dir, name }) => {
      const api = (globalThis as unknown as { api: CurveApi }).api;
      const created = await api.workspace.create({ dir, name });
      if (!created.ok) {
        throw new Error(`create failed: ${created.error.code}`);
      }
      const manifest = created.data;
      const timestamp = manifest.createdAt;
      const tableId = 'tbl_style';
      const columnIds = [
        'col_style_id',
        'col_style_name',
        'col_style_value',
        'col_style_day',
        'col_style_flag',
        'col_style_status',
        'col_style_score',
      ] as const;
      const columns: WorkspaceManifest['tables'][number]['columns'] = [
        {
          id: columnIds[0],
          key: 'id',
          label: 'ID',
          type: 'text',
          role: 'none',
          required: true,
        },
        { id: columnIds[1], key: 'name', label: 'Name', type: 'text', role: 'none' },
        {
          id: columnIds[2],
          key: 'value',
          label: 'Value',
          type: 'number',
          role: 'y',
          precision: 2,
        },
        { id: columnIds[3], key: 'day', label: 'Day', type: 'date', role: 'x' },
        { id: columnIds[4], key: 'flag', label: 'Flag', type: 'boolean', role: 'none' },
        {
          id: columnIds[5],
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
        { id: columnIds[6], key: 'score', label: 'Score', type: 'number', role: 'none' },
      ];
      const barStyle: WorkspaceManifest['tableStyles'][number] = {
        id: 'sty_bars',
        name: 'Bars',
        builtin: false,
        tokens: {
          density: 'normal',
          fontFamily: 'system-ui',
          fontSize: 13,
          header: {
            background: '#374151',
            foreground: '#ffffff',
            bold: true,
            borderColor: '#d1d5db',
          },
          body: {
            background: '#ffffff',
            alternateBackground: '#f9fafb',
            foreground: '#111827',
            borderColor: '#d1d5db',
            grid: 'horizontal',
          },
          selection: { background: '#1d4ed8', foreground: '#ffffff' },
          radius: 4,
          cellPaddingX: 10,
          cellPaddingY: 7,
          zebra: false,
        },
        columnOverrides: {
          col_style_value: {
            label: 'Amount',
            width: 150,
            numberFormat: { style: 'decimal', digits: 0 },
          },
          col_style_score: {
            label: 'Score bar',
            width: 140,
            align: 'right',
            cellRender: 'bar',
            numberFormat: { style: 'decimal', digits: 0 },
          },
        },
        conditionalRules: [],
      };
      const rulesStyle: WorkspaceManifest['tableStyles'][number] = {
        ...barStyle,
        id: 'sty_rules',
        name: 'Rules',
        columnOverrides: {},
        conditionalRules: [
          {
            id: 'rule_hot',
            enabled: true,
            label: 'Hot',
            target: { kind: 'row' },
            when: { kind: 'compare', columnId: 'col_style_value', op: 'gt', value: 1_000_000 },
            style: {
              background: '#fde2e2',
              foreground: '#a40000',
              bold: true,
              icon: 'warning',
            },
          },
          {
            id: 'rule_score',
            enabled: true,
            label: 'High score',
            target: { kind: 'cell', columnId: 'col_style_score' },
            when: { kind: 'compare', columnId: 'col_style_score', op: 'gte', value: 50 },
            style: { background: '#dcfce7', italic: true, icon: 'up' },
          },
          {
            id: 'rule_fallback',
            enabled: true,
            target: { kind: 'row' },
            when: { kind: 'compare', columnId: 'col_style_value', op: 'gte', value: 0 },
            style: { background: '#fef9c3' },
          },
          {
            id: 'rule_disabled',
            enabled: false,
            target: { kind: 'row' },
            when: { kind: 'compare', columnId: 'col_style_value', op: 'lt', value: 0 },
            style: { background: '#ffff00' },
          },
          {
            id: 'rule_missing',
            enabled: true,
            target: { kind: 'row' },
            when: { kind: 'compare', columnId: 'col_style_missing', op: 'eq', value: 'x' },
            style: { background: '#ff00ff' },
          },
        ],
      };
      const styleIds = [
        ['viw_style_report', 'Report', 'builtin.report-light'],
        ['viw_style_compact', 'Compact', 'builtin.compact-light'],
        ['viw_style_dark', 'Dark', 'builtin.dark'],
        ['viw_style_finance', 'Finance', 'builtin.finance'],
        ['viw_style_bars', 'Bars', 'sty_bars'],
        ['viw_style_rules', 'Rules', 'sty_rules'],
      ] as const;
      const views: WorkspaceManifest['views'] = styleIds.map(([viewId, title, styleId]) => ({
        id: viewId,
        kind: 'table',
        refId: tableId,
        title,
        tableView: {
          tableId,
          styleId,
          columnOrder: [...columnIds],
          widths: {},
          hiddenColumnIds:
            viewId === 'viw_style_bars'
              ? ['col_style_name', 'col_style_day', 'col_style_flag']
              : viewId === 'viw_style_rules'
                ? ['col_style_name', 'col_style_day', 'col_style_flag']
                : [],
          sort: [],
          frozenColumnCount: 1,
        },
      }));
      const layout: WorkspaceManifest['layout'] = {
        type: 'pane',
        viewIds: views.map((view) => view.id),
        activeViewId: views[0]?.id ?? null,
      };
      const next = {
        ...manifest,
        updatedAt: timestamp,
        tables: [
          {
            id: tableId,
            name: 'Readings',
            file: `tables/${tableId}.jsonl`,
            schemaVersion: 1,
            columns,
            primaryKey: columnIds[0],
            rowCount: 6,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
        views,
        tableStyles: [barStyle, rulesStyle],
        layout,
      };
      const written = await api.manifest.write({ workspaceId: manifest.id, manifest: next });
      if (!written.ok) {
        throw new Error(`manifest write failed: ${written.error.code}`);
      }

      const rows = [
        ['a', 'Alpha', 1234.5, Date.UTC(2026, 0, 15, 12), true, 'open', 10],
        ['b', 'Beta', -12.25, Date.UTC(2026, 0, 16, 12), false, 'paused', 20],
        ['c', 'Gamma', 1234567.89, Date.UTC(2026, 0, 17, 12), true, 'closed', 30],
        ['d', 'Delta', 0, Date.UTC(2026, 0, 18, 12), false, 'open', 40],
        ['e', 'Epsilon', 42, Date.UTC(2026, 0, 19, 12), true, 'paused', 50],
        ['f', 'Zeta', 999.99, Date.UTC(2026, 0, 20, 12), false, 'closed', 60],
      ] as const;
      const jsonl = rows
        .map((values, index) =>
          JSON.stringify({
            id: `row_style_${String(index + 1)}`,
            v: [...values],
          }),
        )
        .join('\n');
      const tableWrite = await api.table.write({
        workspaceId: manifest.id,
        tableId,
        jsonl: `${jsonl}\n`,
      });
      if (!tableWrite.ok) {
        throw new Error(`table write failed: ${tableWrite.error.code}`);
      }
      const closed = await api.workspace.close({ workspaceId: manifest.id });
      if (!closed.ok) {
        throw new Error(`close failed: ${closed.error.code}`);
      }
      return { root: `${dir}\\${name}.cstudio` };
    },
    { dir: parent, name: SEED_NAME },
  );
  void result;
}

async function openSeededWorkspace(page: Page): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: SEED_NAME }).first().click();
  await expect(page.getByTestId('data-grid')).toBeVisible();
}

interface ComputedStyle {
  backgroundColor: string;
  color: string;
  fontSize: string;
  fontWeight: string;
  fontStyle: string;
  justifyContent: string;
  fontFamily: string;
  height: number;
  borderRightWidth: string;
  borderBottomWidth: string;
}

async function computedStyleOf(page: Page, selector: string): Promise<ComputedStyle> {
  return page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        color: style.color,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        fontStyle: style.fontStyle,
        justifyContent: style.justifyContent,
        fontFamily: style.fontFamily,
        height: element.getBoundingClientRect().height,
        borderRightWidth: style.borderRightWidth,
        borderBottomWidth: style.borderBottomWidth,
      };
    });
}

async function computedStyle(page: Page, testId: string): Promise<ComputedStyle> {
  return computedStyleOf(page, `[data-testid="${testId}"]`);
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.getByTestId('data-grid').screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function selectView(page: Page, title: string, styleId: string): Promise<void> {
  await page.getByRole('tab', { name: title }).click();
  const grid = page.getByTestId('data-grid');
  await expect(grid).toHaveAttribute('data-table-style', styleId);
  await expect(grid).not.toHaveAttribute('data-style-fallback', 'true');
  await expect(page.getByTestId('grid-cell-0-2')).toBeVisible();
}

test.describe('T3.2 table style rendering', () => {
  test('renders the four builtin templates with the style token contract', async ({
    page,
    electronApp,
  }, testInfo) => {
    await seedStyleWorkspace(page, testInfo);
    await openSeededWorkspace(page);

    await selectView(page, 'Report', 'builtin.report-light');
    const reportHeader = await computedStyleOf(page, '.cs-grid__header-cell');
    const reportCell = await computedStyle(page, 'grid-cell-0-2');
    expect(reportCell.height).toBe(32);
    expect(reportCell.justifyContent).toBe('flex-end');
    expect(Number.parseFloat(reportCell.borderRightWidth)).toBe(0);
    expect(Number.parseFloat(reportCell.borderBottomWidth)).toBeGreaterThan(0);
    await expect(page.getByTestId('grid-cell-0-2')).toHaveText('1,234.50');
    await expect(page.getByTestId('grid-cell-0-3')).toHaveText('2026/01/15');
    await expect(page.getByTestId('grid-cell-0-4')).toHaveText('是');
    await expect(page.getByTestId('grid-cell-0-5').locator('.cs-grid__badge')).toHaveText('Open');
    const reportSecondRow = await computedStyle(page, 'grid-cell-1-2');
    expect(reportSecondRow.backgroundColor).toBe(reportCell.backgroundColor);
    await capture(page, testInfo, 't3.2-report-light');

    await selectView(page, 'Compact', 'builtin.compact-light');
    const compactCell = await computedStyle(page, 'grid-cell-0-2');
    const compactHeader = await computedStyleOf(page, '.cs-grid__header-cell');
    expect(compactCell.height).toBe(24);
    expect(compactHeader.fontSize).toBe('12px');
    await capture(page, testInfo, 't3.2-compact-light');

    await selectView(page, 'Dark', 'builtin.dark');
    const darkCell = await computedStyle(page, 'grid-cell-0-2');
    const darkHeader = await computedStyleOf(page, '.cs-grid__header-cell');
    expect(darkCell.backgroundColor).toBe('rgb(30, 30, 30)');
    expect(darkHeader.backgroundColor).toBe('rgb(37, 37, 38)');
    await capture(page, testInfo, 't3.2-dark');

    await selectView(page, 'Finance', 'builtin.finance');
    const financeCell = await computedStyle(page, 'grid-cell-0-2');
    const financeHeader = await computedStyleOf(page, '.cs-grid__header-cell');
    const financeSecondRow = await computedStyle(page, 'grid-cell-1-2');
    expect(financeCell.fontFamily).toContain('Cascadia Mono');
    expect(financeCell.justifyContent).toBe('flex-end');
    expect(financeSecondRow.backgroundColor).not.toBe(financeCell.backgroundColor);
    expect(financeHeader.backgroundColor).toBe('rgb(31, 41, 55)');
    await expect(page.getByTestId('grid-cell-0-2')).toHaveText('1,234.50');
    await capture(page, testInfo, 't3.2-finance');

    // A persisted user style exercises column overrides and the bar renderer.
    await selectView(page, 'Bars', 'sty_bars');
    const amountHeader = page.locator('[role="columnheader"][data-column-id="col_style_value"]');
    const scoreHeader = page.locator('[role="columnheader"][data-column-id="col_style_score"]');
    await expect(amountHeader).toHaveText('Amount');
    await expect(scoreHeader).toHaveText('Score bar');
    const amountBox = await amountHeader.boundingBox();
    const scoreBox = await scoreHeader.boundingBox();
    expect(amountBox?.width).toBeCloseTo(150, 0);
    expect(scoreBox?.width).toBeCloseTo(140, 0);
    await expect(
      page.locator('[data-testid^="grid-cell-"][data-column-id="col_style_value"]').first(),
    ).toHaveText('1,235');
    await expect(
      page.locator('[data-testid^="grid-cell-"][data-column-id="col_style_score"]').first(),
    ).toHaveAttribute('data-render', 'bar');
    const barRatios = await page
      .locator('[data-testid^="grid-cell-"][data-column-id="col_style_score"] .cs-grid__bar')
      .evaluateAll((bars) =>
        bars.map((bar) => {
          const cell = bar.parentElement;
          if (cell === null) {
            return 0;
          }
          return bar.getBoundingClientRect().width / cell.getBoundingClientRect().width;
        }),
      );
    expect(barRatios[0]).toBeCloseTo(0, 1);
    expect(barRatios[5]).toBeCloseTo(1, 1);
    await capture(page, testInfo, 't3.2-bars');

    // T3.3 — conditional rules: first match, row/cell targets, disabled and
    // missing columns, and decoration precedence.
    await selectView(page, 'Rules', 'sty_rules');
    const hotCell = page.getByTestId('grid-cell-2-0');
    await expect(hotCell).toHaveAttribute('data-conditional-rule', 'rule_hot');
    const hotStyle = await computedStyle(page, 'grid-cell-2-0');
    expect(hotStyle.backgroundColor).toBe('rgb(253, 226, 226)');
    expect(hotStyle.color).toBe('rgb(164, 0, 0)');
    expect(hotStyle.fontWeight).toBe('600');
    await expect(hotCell.locator('.cs-grid__rule-icon')).toHaveAttribute('data-icon', 'warning');
    await expect(page.getByTestId('grid-cell-2-1').locator('.cs-grid__rule-icon')).toHaveCount(0);

    const fallbackStyle = await computedStyle(page, 'grid-cell-0-1');
    expect(fallbackStyle.backgroundColor).toBe('rgb(254, 249, 195)');
    await expect(page.getByTestId('grid-cell-1-0')).not.toHaveAttribute('data-conditional-rule');

    const scoreCell = page.getByTestId('grid-cell-4-3');
    await expect(scoreCell).toHaveAttribute('data-conditional-rule', 'rule_score');
    const scoreStyle = await computedStyle(page, 'grid-cell-4-3');
    expect(scoreStyle.backgroundColor).toBe('rgb(220, 252, 231)');
    expect(scoreStyle.fontStyle).toBe('italic');
    await expect(scoreCell.locator('.cs-grid__rule-icon')).toHaveAttribute('data-icon', 'up');
    await capture(page, testInfo, 't3.3-rules');

    // Selection wins over the rule background and removes the rule marker.
    await hotCell.click();
    await expect(hotCell).not.toHaveAttribute('data-conditional-rule');
    const selectedStyle = await computedStyle(page, 'grid-cell-2-0');
    expect(selectedStyle.backgroundColor).toBe('rgb(29, 78, 216)');

    // 200% zoom keeps the decorated grid visible (keyboard navigation itself is
    // covered by grid.spec.ts; this feature adds no new interactive control).
    await electronApp.evaluate(({ BrowserWindow }) => {
      const [window] = BrowserWindow.getAllWindows();
      window?.webContents.setZoomFactor(2);
    });
    await page.waitForFunction(() => window.innerWidth < 800);
    await expect(page.getByTestId('data-grid')).toBeVisible();
    await expect(page.getByTestId('grid-cell-0-1')).toBeVisible();
    const zoomedFallback = await computedStyle(page, 'grid-cell-0-1');
    expect(zoomedFallback.backgroundColor).toBe('rgb(254, 249, 195)');

    await electronApp.evaluate(({ BrowserWindow }) => {
      const [window] = BrowserWindow.getAllWindows();
      window?.webContents.setZoomFactor(1);
    });
    await page.waitForFunction(() => window.innerWidth >= 800);

    // Returning to the builtin view proves the override did not touch the schema
    // or the other views.
    await selectView(page, 'Report', 'builtin.report-light');
    await expect(
      page.locator('[role="columnheader"][data-column-id="col_style_score"]'),
    ).toHaveText('Score');
    await expect(page.getByTestId('grid-cell-0-6')).toHaveText('10');

    // The variables are inherited from the provider section, not per cell.
    const provider = page.getByTestId('data-grid');
    await expect(provider).toHaveCSS('--cs-table-row-height', '32px');
    expect(reportHeader.height).toBe(32);
  });
});
