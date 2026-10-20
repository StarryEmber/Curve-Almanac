// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from './Button';

afterEach(() => {
  cleanup();
});

describe('Button', () => {
  it('renders an accessible text button and forwards clicks', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Open workspace</Button>);

    const button = screen.getByRole('button', { name: 'Open workspace' });
    expect(button.getAttribute('type')).toBe('button');

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps the caller-supplied accessible name on icon-only buttons', () => {
    render(
      <Button iconOnly aria-label="Toggle sidebar">
        <span aria-hidden="true">≡</span>
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Toggle sidebar' })).toBeDefined();
  });

  it('requires an aria-label when iconOnly is set (compile-time guard)', () => {
    // @ts-expect-error icon-only buttons must declare aria-label (TASKS T0.4).
    render(<Button iconOnly>×</Button>);

    expect(screen.getByRole('button').getAttribute('aria-label')).toBeNull();
  });

  it('applies variant and size classes', () => {
    render(
      <Button variant="primary" size="sm">
        Create
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Create' });
    expect(button.className).toContain('cs-button--primary');
    expect(button.className).toContain('cs-button--sm');
  });

  it('does not fire clicks while disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
