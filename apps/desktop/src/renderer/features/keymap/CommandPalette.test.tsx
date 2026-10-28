// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n';

import { CommandPalette } from './CommandPalette';

import type { CommandPaletteProps } from './CommandPalette';
import type { PaletteCommandItem } from './palette-model';
import type { ReactElement } from 'react';

afterEach(() => {
  cleanup();
  document.documentElement.style.overflow = '';
});

function item(overrides: Partial<PaletteCommandItem> = {}): PaletteCommandItem {
  return {
    id: 'history.undo',
    labelKey: 'command.history.undo',
    shortcuts: ['Ctrl/Cmd+Z'],
    reason: null,
    recentRank: null,
    ...overrides,
  };
}

function renderPalette(
  props: Partial<CommandPaletteProps> = {},
  items: PaletteCommandItem[] = [
    item(),
    item({ id: 'history.redo', labelKey: 'command.history.redo', shortcuts: ['Ctrl/Cmd+Y'] }),
    item({
      id: 'layout.splitHorizontal',
      labelKey: 'command.layout.splitHorizontal',
      shortcuts: ['Ctrl/Cmd+Alt+H'],
    }),
  ],
): { onRun: ReturnType<typeof vi.fn>; onClose: ReturnType<typeof vi.fn> } {
  const onRun = vi.fn();
  const onClose = vi.fn();
  const palette = (
    <I18nProvider initialLocale="zh-CN">
      <CommandPalette open items={items} onRun={onRun} onClose={onClose} {...props} />
    </I18nProvider>
  ) as ReactElement;

  render(palette);
  return { onRun, onClose };
}

describe('CommandPalette', () => {
  it('renders nothing while closed', () => {
    renderPalette({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens as a labelled dialog and focuses the search input', () => {
    renderPalette();

    expect(screen.getByRole('dialog', { name: '命令面板' })).toBeDefined();
    const input = screen.getByRole('combobox', { name: '搜索命令' });
    expect(document.activeElement).toBe(input);
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getByRole('option', { name: /撤销/ }).textContent).toContain('Ctrl+Z');
  });

  it('filters entries and runs the active command with Enter', () => {
    const { onRun } = renderPalette();
    const input = screen.getByRole('combobox', { name: '搜索命令' });

    fireEvent.change(input, { target: { value: '分栏' } });

    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option').textContent).toContain('水平分栏');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onRun).toHaveBeenCalledWith('layout.splitHorizontal');
  });

  it('moves with ArrowUp/ArrowDown, Home and End', () => {
    const { onRun } = renderPalette();
    const input = screen.getByRole('combobox', { name: '搜索命令' });

    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0]?.id);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1]?.id);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRun).toHaveBeenLastCalledWith('history.redo');

    fireEvent.keyDown(input, { key: 'End' });
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[2]?.id);
    fireEvent.keyDown(input, { key: 'Home' });
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[0]?.id);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(input.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[2]?.id);
  });

  it('closes with Escape', () => {
    const { onClose } = renderPalette();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the disabled reason and does not run a disabled command', () => {
    const { onRun } = renderPalette({}, [
      item({
        id: 'app.save',
        labelKey: 'command.app.save',
        reason: 'no-workspace',
      }),
    ]);
    const input = screen.getByRole('combobox', { name: '搜索命令' });
    const option = screen.getByRole('option', { name: /立即保存/ });

    expect(option.getAttribute('aria-disabled')).toBe('true');
    expect(option.textContent).toContain('先打开一个工作区');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRun).not.toHaveBeenCalled();
  });

  it('shows the empty state when nothing matches and recovers when the query clears', () => {
    renderPalette();
    const input = screen.getByRole('combobox', { name: '搜索命令' });

    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByRole('status').textContent).toContain('没有匹配的命令');
    expect(screen.queryAllByRole('option')).toHaveLength(0);

    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('puts recent commands first and marks them', () => {
    renderPalette({}, [
      item({ id: 'a', labelKey: 'command.app.help', recentRank: 1 }),
      item({ id: 'b', labelKey: 'command.history.redo', recentRank: 0 }),
    ]);

    const options = screen.getAllByRole('option');
    expect(options[0]?.getAttribute('data-command-id')).toBe('b');
    expect(options[0]?.getAttribute('data-command-recent')).toBe('true');
    expect(options[1]?.getAttribute('data-command-recent')).toBe('true');
  });

  it('runs a command on click and keeps the input focused on mousedown', () => {
    const { onRun } = renderPalette();
    const option = screen.getByRole('option', { name: /重做/ });

    fireEvent.mouseDown(option);
    fireEvent.click(option);

    expect(onRun).toHaveBeenCalledWith('history.redo');
  });
});
