import type { ImportIssue } from '@curve/table-engine';

/**
 * Error-report CSV (TESTPLAN E4 step 6). The file always uses UTF-8 with BOM
 * (SPEC §16.4), CRLF and quoted fields so Excel opens it without a dialog. One
 * line represents one bad data row, even when that row has several cell issues;
 * the full issue list remains available in the wizard.
 */

function field(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function buildImportErrorCsv(issues: readonly ImportIssue[]): string {
  const groups = new Map<number, ImportIssue[]>();
  for (const issue of issues) {
    const group = groups.get(issue.row);
    if (group === undefined) {
      groups.set(issue.row, [issue]);
    } else {
      group.push(issue);
    }
  }

  const lines = ['row,columns,codes,values,messages'];
  for (const [row, group] of groups) {
    const columns = [...new Set(group.map((issue) => issue.columnName).filter(Boolean))];
    const codes = [...new Set(group.map((issue) => issue.code))];
    const values = [...new Set(group.map((issue) => String(issue.value ?? '')))];
    const messages = [...new Set(group.map((issue) => issue.message))];
    lines.push(
      [
        field(row),
        field(columns.join(' | ')),
        field(codes.join(' | ')),
        field(values.join(' | ')),
        field(messages.join(' | ')),
      ].join(','),
    );
  }
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function importErrorFileName(): string {
  return 'import-errors.csv';
}
