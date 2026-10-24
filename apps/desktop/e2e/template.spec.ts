import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect } from '@playwright/test';

import { launchCurveApp, test } from './fixtures';

import type { LaunchedCurveApp } from './fixtures';
import type { CurveApi, WorkspaceManifest } from '../src/shared/contracts/ipc';
import type { Page } from '@playwright/test';

/**
 * T3.5 — template management and `.curvestyle.json` transfer.
 *
 * Workspaces are seeded through `window.api` so both sides of the round trip
 * share the exact same table schema. The export goes through the real save
 * dialog stand-in (`CURVE_E2E_SAVE`), the second launch imports that file with
 * `CURVE_E2E_IMPORT`, and the assertions compare the computed grid contract
 * (CSS variables, cell colours, overrides) instead of pixels.
 */

const SOURCE_STYLE_ID = 'sty_source';
const SOURCE_RULE_ID = 'rule_hot';

interface SeedOptions {
  dir: string;
  name: string;
  withStyle: boolean;
}

async function seedWorkspace(page: Page, options: SeedOptions): Promise<string> {
  const result = await page.evaluate(async ({ dir, name, withStyle }) => {
    const api = (globalThis as unknown as { api: CurveApi }).api;
    const created = await api.workspace.create({ dir, name });
    if (!created.ok) {
      throw new Error(`create failed: ${created.error.code}`);
    }
    const manifest = created.data;
    const timestamp = manifest.createdAt;
    const tableId = 'tbl_template';
    const columnIds = ['col_id', 'col_name', 'col_value', 'col_day', 'col_flag', 'col_status'];
    const columns: WorkspaceManifest['tables'][number]['columns'] = [
      {
        id: columnIds[0] ?? 'col_id',
        key: 'id',
        label: 'ID',
        type: 'text',
        role: 'none',
        required: true,
      },
      { id: columnIds[1] ?? 'col_name', key: 'name', label: 'Name', type: 'text', role: 'none' },
      {
        id: columnIds[2] ?? 'col_value',
        key: 'value',
        label: 'Value',
        type: 'number',
        role: 'y',
        precision: 2,
      },
      { id: columnIds[3] ?? 'col_day', key: 'day', label: 'Day', type: 'date', role: 'x' },
      { id: columnIds[4] ?? 'col_flag', key: 'flag', label: 'Flag', type: 'boolean', role: 'none' },
      {
        id: columnIds[5] ?? 'col_status',
        key: 'status',
        label: 'Status',
        type: 'enum',
        role: 'none',
        enumOptions: [
          { value: 'open', label: 'Open' },
          { value: 'closed', label: 'Closed' },
        ],
      },
    ];

    const sourceStyle: WorkspaceManifest['tableStyles'][number] = {
      id: 'sty_source',
      name: 'Source',
      builtin: false,
      tokens: {
        density: 'compact',
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: 12,
        header: {
          background: '#0f172a',
          foreground: '#e2e8f0',
          bold: true,
          borderColor: '#334155',
        },
        body: {
          background: '#ffffff',
          alternateBackground: '#eef2f7',
          foreground: '#111827',
          borderColor: '#cbd5e1',
          grid: 'horizontal',
        },
        selection: { background: '#1d4ed8', foreground: '#ffffff' },
        radius: 2,
        cellPaddingX: 8,
        cellPaddingY: 4,
        zebra: true,
      },
      columnOverrides: {
        col_value: {
          label: 'Amount',
          width: 150,
          align: 'right',
          numberFormat: { style: 'decimal', digits: 0 },
        },
      },
      conditionalRules: [
        {
          id: 'rule_hot',
          enabled: true,
          label: 'Hot',
          target: { kind: 'row' },
          when: { kind: 'compare', columnId: 'col_value', op: 'gt', value: 20 },
          style: {
            background: '#fde2e2',
            foreground: '#a40000',
            bold: true,
            icon: 'warning',
          },
        },
      ],
    };

    const viewId = withStyle ? 'viw_source' : 'viw_plain';
    const view: WorkspaceManifest['views'][number] = {
      id: viewId,
      kind: 'table',
      refId: tableId,
      title: 'Readings',
      tableView: {
        tableId,
        styleId: withStyle ? 'sty_source' : 'builtin.report-light',
        columnOrder: [...columnIds],
        widths: {},
        hiddenColumnIds: [],
        sort: [],
        frozenColumnCount: 1,
      },
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
          primaryKey: columnIds[0] ?? 'col_id',
          rowCount: 4,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      views: [view],
      tableStyles: withStyle ? [sourceStyle] : [],
      layout: { type: 'pane' as const, viewIds: [viewId], activeViewId: viewId },
    };
    const written = await api.manifest.write({ workspaceId: manifest.id, manifest: next });
    if (!written.ok) {
      throw new Error(`manifest write failed: ${written.error.code}`);
    }

    const rows = [
      ['a', 'Alpha', 10, Date.UTC(2026, 0, 15, 12), true, 'open'],
      ['b', 'Beta', 30, Date.UTC(2026, 0, 16, 12), false, 'closed'],
      ['c', 'Gamma', 50, Date.UTC(2026, 0, 17, 12), true, 'open'],
      ['d', 'Delta', -5, Date.UTC(2026, 0, 18, 12), false, 'closed'],
    ] as const;
    const jsonl = rows
      .map((values, index) =>
        JSON.stringify({ id: `row_template_${String(index + 1)}`, v: [...values] }),
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
    return `${dir}\\${name}.cstudio`;
  }, options);
  return result;
}

function readManifest(root: string): WorkspaceManifest {
  return JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as WorkspaceManifest;
}

async function openRecentWorkspace(page: Page, name: string): Promise<void> {
  await page.reload();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await page.getByTestId('recent-workspace').filter({ hasText: name }).first().click();
  await expect(page.getByTestId('data-grid')).toBeVisible();
}

async function openStyleTab(page: Page): Promise<void> {
  await page.getByTestId('inspector').getByRole('tab', { name: '样式' }).click();
  await expect(page.getByTestId('style-panel')).toBeVisible();
}

async function openManager(page: Page): Promise<void> {
  await page.getByTestId('style-templates-open').click();
  await expect(page.getByRole('dialog', { name: '模板管理' })).toBeVisible();
}

interface GridContract {
  styleId: string | null;
  headerBg: string;
  bodyBg: string;
  alternateBg: string;
  rowHeight: string;
  fontFamily: string;
  radius: string;
  normalCell: string;
  alternateCell: string;
  ruleCell: string;
  ruleColor: string;
  headerLabel: string;
  headerWidth: number;
}

async function readGridContract(page: Page): Promise<GridContract> {
  const grid = page.getByTestId('data-grid');
  const vars = await grid.evaluate((element) => {
    const style = getComputedStyle(element);
    const read = (name: string): string => style.getPropertyValue(name).trim();
    return {
      styleId: element.getAttribute('data-table-style'),
      headerBg: read('--cs-table-header-bg'),
      bodyBg: read('--cs-table-body-bg'),
      alternateBg: read('--cs-table-body-alt-bg'),
      rowHeight: read('--cs-table-row-height'),
      fontFamily: read('--cs-table-font-family'),
      radius: read('--cs-table-radius'),
    };
  });
  const cellColour = async (testId: string): Promise<string> =>
    page.getByTestId(testId).evaluate((element) => getComputedStyle(element).backgroundColor);
  const ruleCell = page.getByTestId('grid-cell-1-2');
  const header = page.locator('[role="columnheader"][data-column-id="col_value"]');
  const box = await header.boundingBox();
  return {
    ...vars,
    normalCell: await cellColour('grid-cell-0-2'),
    alternateCell: await cellColour('grid-cell-3-2'),
    ruleCell: await cellColour('grid-cell-1-2'),
    ruleColor: await ruleCell.evaluate((element) => getComputedStyle(element).color),
    headerLabel: (await header.textContent())?.trim() ?? '',
    headerWidth: box?.width ?? 0,
  };
}

async function setZoom(app: LaunchedCurveApp, factor: number): Promise<void> {
  await app.electronApp.evaluate(({ BrowserWindow }, value) => {
    const [window] = BrowserWindow.getAllWindows();
    window?.webContents.setZoomFactor(value);
  }, factor);
  const page = app.page;
  await page.waitForFunction((expected) => {
    const width = window.innerWidth;
    return expected >= 2 ? width < 800 : width >= 800;
  }, factor);
}

test.describe('T3.5 template management', () => {
  test('exports a template, imports it into a new workspace, matches rendering and falls back on delete', async ({
    userDataDir,
  }, testInfo) => {
    test.setTimeout(180_000);
    const parent = testInfo.outputPath('templates');
    mkdirSync(parent, { recursive: true });
    const exportPath = join(userDataDir, 'shared-template.curvestyle.json');
    const rootA = join(parent, 'Source Workspace.cstudio');
    const rootB = join(parent, 'Target Workspace.cstudio');
    let copyId = '';
    let sourceContract: GridContract | null = null;

    const first = await launchCurveApp({
      userDataDir,
      importFile: exportPath,
      saveFile: exportPath,
    });
    try {
      await expect(first.page.getByTestId('welcome')).toBeVisible();
      expect(
        await seedWorkspace(first.page, { dir: parent, name: 'Source Workspace', withStyle: true }),
      ).toBe(rootA);
      expect(
        await seedWorkspace(first.page, {
          dir: parent,
          name: 'Target Workspace',
          withStyle: false,
        }),
      ).toBe(rootB);

      await openRecentWorkspace(first.page, 'Source Workspace');
      await openStyleTab(first.page);
      await openManager(first.page);

      // Duplicate, rename and apply the seeded user style.
      await first.page.getByTestId(`style-template-duplicate-${SOURCE_STYLE_ID}`).click();
      await expect.poll(() => readManifest(rootA).tableStyles.length).toBe(2);
      const copy = readManifest(rootA).tableStyles.find((style) => style.id !== SOURCE_STYLE_ID);
      expect(copy).toBeDefined();
      copyId = copy?.id ?? '';

      await first.page.getByTestId(`style-template-rename-${copyId}`).click();
      const renameInput = first.page.getByTestId(`style-template-rename-input-${copyId}`);
      await renameInput.fill('Shared report');
      await first.page.getByTestId(`style-template-rename-save-${copyId}`).click();
      await expect
        .poll(() => readManifest(rootA).tableStyles.find((style) => style.id === copyId)?.name)
        .toBe('Shared report');

      await first.page.getByTestId(`style-template-apply-${copyId}`).click();
      await expect.poll(() => readManifest(rootA).views[0]?.tableView?.styleId).toBe(copyId);
      await first.page.getByTestId(`style-template-default-${copyId}`).click();
      await expect.poll(() => readManifest(rootA).settings.defaultTableStyleId).toBe(copyId);

      await first.page.getByTestId(`style-template-export-${copyId}`).click();
      await expect.poll(() => existsSync(exportPath)).toBe(true);
      await expect
        .poll(() => first.page.getByTestId('style-template-status').textContent())
        .toContain('shared-template.curvestyle.json');

      const exported = JSON.parse(readFileSync(exportPath, 'utf8')) as {
        kind: string;
        version: number;
        exportedAt: string;
        style: WorkspaceManifest['tableStyles'][number];
      };
      expect(exported.kind).toBe('curve-table-style');
      expect(exported.version).toBe(1);
      expect(Number.isNaN(Date.parse(exported.exportedAt))).toBe(false);
      expect(exported.style.name).toBe('Shared report');
      expect(exported.style.builtin).toBe(false);
      expect(exported.style.id).toBe(copyId);
      expect(exported.style.conditionalRules.map((rule) => rule.id)).not.toContain(SOURCE_RULE_ID);

      await first.page.getByTestId('style-templates-close').click();
      sourceContract = await readGridContract(first.page);
      expect(sourceContract.styleId).toBe(copyId);
      expect(sourceContract.rowHeight).toBe('24px');
      expect(sourceContract.headerLabel).toBe('Amount');
      expect(sourceContract.headerWidth).toBeCloseTo(150, 0);
      expect(sourceContract.ruleCell).toBe('rgb(253, 226, 226)');
      expect(sourceContract.normalCell).not.toBe(sourceContract.alternateCell);

      const screenshot = testInfo.outputPath('t3.5-template-manager.png');
      const templatesButton = first.page.getByTestId('style-templates-open');
      await templatesButton.focus();
      await first.page.keyboard.press('Enter');
      await expect(first.page.getByRole('dialog', { name: '模板管理' })).toBeVisible();
      await first.page.getByRole('dialog', { name: '模板管理' }).screenshot({ path: screenshot });
      await testInfo.attach('t3.5-template-manager', {
        path: screenshot,
        contentType: 'image/png',
      });
      await first.page.keyboard.press('Escape');
    } finally {
      await first.electronApp.close();
    }

    const second = await launchCurveApp({
      userDataDir,
      importFile: exportPath,
      saveFile: join(userDataDir, 'roundtrip.curvestyle.json'),
    });
    try {
      await openRecentWorkspace(second.page, 'Target Workspace');
      const beforeImport = await readGridContract(second.page);
      expect(beforeImport.styleId).toBe('builtin.report-light');

      await openStyleTab(second.page);
      await openManager(second.page);
      await second.page.getByTestId('style-template-import').click();
      await expect(second.page.getByTestId('style-import-dialog')).toBeVisible();
      await second.page.getByTestId('style-import-pick').click();
      await expect(second.page.getByTestId('style-import-summary')).toBeVisible();
      expect(await second.page.getByTestId('style-import-summary').textContent()).toContain(
        'Shared report',
      );
      await expect(second.page.getByTestId('style-import-missing')).toHaveCount(0);
      const importScreenshot = testInfo.outputPath('t3.5-template-import.png');
      await second.page
        .getByRole('dialog', { name: '导入表格样式' })
        .screenshot({ path: importScreenshot });
      await testInfo.attach('t3.5-template-import', {
        path: importScreenshot,
        contentType: 'image/png',
      });
      await second.page.getByTestId('style-import-confirm').click();

      await expect.poll(() => readManifest(rootB).tableStyles.length).toBe(1);
      const imported = readManifest(rootB).tableStyles[0];
      expect(imported).toBeDefined();
      if (imported === undefined) {
        return;
      }
      expect(imported.id.startsWith('sty_')).toBe(true);
      expect(imported.id).not.toBe(copyId);
      expect(imported.name).toBe('Shared report');
      expect(imported.conditionalRules.map((rule) => rule.id)).not.toContain(SOURCE_RULE_ID);
      await expect.poll(() => readManifest(rootB).views[0]?.tableView?.styleId).toBe(imported.id);
      await expect(second.page.getByTestId('data-grid')).toHaveAttribute(
        'data-table-style',
        imported.id,
      );

      const importedContract = await readGridContract(second.page);
      const expected = sourceContract;
      expect(expected).not.toBeNull();
      if (expected === null) {
        return;
      }
      expect(importedContract.styleId).toBe(imported.id);
      expect(importedContract.headerBg).toBe(expected.headerBg);
      expect(importedContract.bodyBg).toBe(expected.bodyBg);
      expect(importedContract.alternateBg).toBe(expected.alternateBg);
      expect(importedContract.rowHeight).toBe(expected.rowHeight);
      expect(importedContract.fontFamily).toBe(expected.fontFamily);
      expect(importedContract.radius).toBe(expected.radius);
      expect(importedContract.normalCell).toBe(expected.normalCell);
      expect(importedContract.alternateCell).toBe(expected.alternateCell);
      expect(importedContract.ruleCell).toBe(expected.ruleCell);
      expect(importedContract.ruleColor).toBe(expected.ruleColor);
      expect(importedContract.headerLabel).toBe(expected.headerLabel);
      expect(importedContract.headerWidth).toBe(expected.headerWidth);

      // Deleting a referenced template falls back to the workspace default.
      await openManager(second.page);
      await second.page.getByTestId(`style-template-delete-${imported.id}`).click();
      await expect(
        second.page.getByRole('dialog', { name: '删除模板“Shared report”？' }),
      ).toBeVisible();
      await second.page.getByTestId('style-template-delete-confirm').click();
      await expect
        .poll(() => second.page.getByTestId('style-template-status').textContent())
        .toContain('回退');
      await expect.poll(() => readManifest(rootB).tableStyles.length).toBe(0);
      await expect
        .poll(() => readManifest(rootB).views[0]?.tableView?.styleId)
        .toBe('builtin.report-light');
      await second.page.getByTestId('style-templates-close').click();
      await expect(second.page.getByTestId('data-grid')).toHaveAttribute(
        'data-table-style',
        'builtin.report-light',
      );

      // The deletion is undoable (SPEC §13.1) and restores style + view reference.
      await second.page.keyboard.press('Control+z');
      await expect.poll(() => readManifest(rootB).tableStyles.length).toBe(1);
      await expect.poll(() => readManifest(rootB).views[0]?.tableView?.styleId).toBe(imported.id);
      await expect(second.page.getByTestId('data-grid')).toHaveAttribute(
        'data-table-style',
        imported.id,
      );

      await setZoom(second, 2);
      await openManager(second.page);
      const dialogBox = await second.page.getByRole('dialog', { name: '模板管理' }).boundingBox();
      const viewport = await second.page.evaluate(() => window.innerWidth);
      expect(dialogBox?.width ?? viewport).toBeLessThanOrEqual(viewport);
      await expect(second.page.getByTestId(`style-template-apply-${imported.id}`)).toBeVisible();
      await second.page.keyboard.press('Escape');
      await setZoom(second, 1);
    } finally {
      await second.electronApp.close();
    }
  });

  test('rejects a corrupt template file without touching the manifest', async ({
    userDataDir,
  }, testInfo) => {
    test.setTimeout(120_000);
    const parent = testInfo.outputPath('templates-invalid');
    mkdirSync(parent, { recursive: true });
    const badPath = join(userDataDir, 'future.curvestyle.json');
    writeFileSync(
      badPath,
      JSON.stringify({
        kind: 'curve-table-style',
        version: 9,
        exportedAt: '2026-01-01T00:00:00.000Z',
      }),
      'utf8',
    );
    const root = join(parent, 'Invalid Workspace.cstudio');

    const app = await launchCurveApp({ userDataDir, importFile: badPath });
    try {
      await expect(app.page.getByTestId('welcome')).toBeVisible();
      expect(
        await seedWorkspace(app.page, { dir: parent, name: 'Invalid Workspace', withStyle: false }),
      ).toBe(root);
      await openRecentWorkspace(app.page, 'Invalid Workspace');
      const before = readFileSync(join(root, 'manifest.json'), 'utf8');

      await openStyleTab(app.page);
      await openManager(app.page);
      await app.page.getByTestId('style-template-import').click();
      await app.page.getByTestId('style-import-pick').click();
      await expect(app.page.getByRole('alert')).toContainText('版本不受支持');
      await expect(app.page.getByTestId('style-import-confirm')).toHaveCount(0);
      expect(readManifest(root).tableStyles).toEqual([]);
      expect(readFileSync(join(root, 'manifest.json'), 'utf8')).toBe(before);

      await setZoom(app, 2);
      await expect(app.page.getByTestId('style-import-dialog')).toBeVisible();
      const dialogBox = await app.page.getByTestId('style-import-dialog').boundingBox();
      const viewport = await app.page.evaluate(() => window.innerWidth);
      expect(dialogBox?.width ?? viewport).toBeLessThanOrEqual(viewport);
      await app.page.keyboard.press('Escape');
      await setZoom(app, 1);
    } finally {
      await app.electronApp.close();
    }
  });
});
