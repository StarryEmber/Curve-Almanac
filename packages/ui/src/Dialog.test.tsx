// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Button } from './Button';
import { Dialog } from './Dialog';

import type { ReactElement } from 'react';

afterEach(() => {
  cleanup();
  document.documentElement.style.overflow = '';
});

function renderDialog(options: { onClose?: () => void; open?: boolean } = {}): {
  onClose: () => void;
} {
  const onClose = options.onClose ?? vi.fn();
  const open = options.open ?? true;

  render(
    <Dialog
      open={open}
      title="Keyboard shortcuts"
      description="Move around without a mouse."
      closeLabel="Close dialog"
      onClose={onClose}
      footer={<Button>Done</Button>}
    >
      <p>Press Tab to cycle.</p>
      <Button>Reset</Button>
    </Dialog>,
  );

  return { onClose };
}

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a labelled modal dialog and focuses its first control', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-describedby')).not.toBeNull();
    expect(screen.getByText('Move around without a mouse.')).toBeDefined();

    // The close button is the first focusable element inside the panel.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close dialog' }));
  });

  it('traps Tab at both ends of the dialog', () => {
    renderDialog();

    const close = screen.getByRole('button', { name: 'Close dialog' });
    const done = screen.getByRole('button', { name: 'Done' });

    done.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    close.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(done);
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a backdrop press but not on a press inside the panel', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });

    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = screen.getByRole('dialog').parentElement;
    expect(backdrop).not.toBeNull();
    if (backdrop) {
      fireEvent.mouseDown(backdrop);
    }
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('locks background scrolling while open and restores it on close', () => {
    const { rerender } = render(
      <Dialog open title="Title" closeLabel="Close" onClose={() => undefined}>
        <p>Body</p>
      </Dialog>,
    );
    expect(document.documentElement.style.overflow).toBe('hidden');

    rerender(
      <Dialog open={false} title="Title" closeLabel="Close" onClose={() => undefined}>
        <p>Body</p>
      </Dialog>,
    );
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('restores focus to the element that opened it', () => {
    function Harness(): ReactElement {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open shortcuts
          </button>
          <Dialog open={open} title="Shortcuts" closeLabel="Close" onClose={() => setOpen(false)}>
            <Button>Inner</Button>
          </Dialog>
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open shortcuts' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog')).toBeDefined();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('pulls focus back when something outside steals it', () => {
    render(
      <>
        <button type="button">Outside</button>
        <Dialog open title="Title" closeLabel="Close" onClose={() => undefined}>
          <Button>Inner</Button>
        </Dialog>
      </>,
    );

    const outside = screen.getByRole('button', { name: 'Outside' });
    outside.focus();
    fireEvent.focusIn(outside);

    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });
});
