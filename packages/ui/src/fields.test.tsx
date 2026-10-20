// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Input } from './Input';
import { Select } from './Select';

afterEach(() => {
  cleanup();
});

describe('Input', () => {
  it('associates the visible label with the control', () => {
    render(<Input label="Workspace name" defaultValue="sales" />);

    const input = screen.getByLabelText('Workspace name');
    expect((input as HTMLInputElement).value).toBe('sales');
  });

  it('wires hint and error text through aria-describedby', () => {
    render(<Input label="Delimiter" hint="One character" error="Required" defaultValue="" />);

    const input = screen.getByLabelText('Delimiter');
    const describedBy = input.getAttribute('aria-describedby') ?? '';
    const ids = describedBy.split(' ');

    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[0] ?? '')?.textContent).toBe('One character');
    expect(document.getElementById(ids[1] ?? '')?.textContent).toBe('Required');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('omits describedby when there is nothing to describe', () => {
    render(<Input label="Name" />);

    expect(screen.getByLabelText('Name').getAttribute('aria-describedby')).toBeNull();
  });
});

describe('Select', () => {
  const options = [
    { value: 'zh-CN', label: '简体中文' },
    { value: 'en-US', label: 'English' },
  ];

  it('renders labelled options and reports changes', () => {
    const onChange = vi.fn();
    render(<Select label="Language" options={options} defaultValue="zh-CN" onChange={onChange} />);

    const select = screen.getByLabelText('Language');
    fireEvent.change(select, { target: { value: 'en-US' } });

    expect((select as HTMLSelectElement).value).toBe('en-US');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('can hide the label visually while keeping it accessible', () => {
    render(<Select label="Language" options={options} hideLabel />);

    expect(screen.getByLabelText('Language')).toBeDefined();
    expect(screen.getByText('Language').className).toContain('cs-visually-hidden');
  });
});
