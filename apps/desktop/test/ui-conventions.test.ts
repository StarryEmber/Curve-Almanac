import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * Rendering conventions from AGENTS §5 and TASKS T0.4:
 *
 * - no user-visible copy outside the message tables (grep-able gate);
 * - no colour literals in components or in the shell stylesheet;
 * - every token the shell consumes is declared by `@curve/ui`.
 *
 * The copy gate parses the file with the TypeScript compiler and inspects JSX
 * text nodes, string literals and template literals only, so documentation
 * comments may quote the specification (or Chinese) freely.
 *
 * Runs in the Node project (`apps/desktop/tsconfig.test.json`) because it reads
 * source files from disk — the browser projects stay free of Node types.
 */

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

function walk(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const absolute = join(directory, entry);
    if (statSync(absolute).isDirectory()) {
      files.push(...walk(absolute));
    } else {
      files.push(absolute);
    }
  }
  return files;
}

const rendererRoot = join(repositoryRoot, 'apps', 'desktop', 'src', 'renderer');
const uiRoot = join(repositoryRoot, 'packages', 'ui', 'src');
const messageRoot = join(rendererRoot, 'i18n', 'messages');

const sourceFiles = [rendererRoot, uiRoot]
  .flatMap(walk)
  .filter((file) => /\.(ts|tsx)$/.test(file))
  .filter((file) => !/\.test\.tsx?$/.test(file))
  .filter((file) => !file.startsWith(messageRoot));

const cjk = /[\u3400-\u9fff\uf900-\ufaff]/;
const colorLiteral = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/i;
/** Symbols (close glyphs, separators) are allowed as JSX text; words are not. */
const allowedJsxText = /^[\s×·•—–…:;,.!?()\-/\\]*$/u;

interface StringViolations {
  cjk: string[];
  jsxText: string[];
}

function inspect(file: string): StringViolations {
  const source = readFileSync(file, 'utf8');
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const violations: StringViolations = { cjk: [], jsxText: [] };

  const checkCjk = (text: string): void => {
    if (cjk.test(text)) {
      violations.cjk.push(text.trim());
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      checkCjk(node.text);
      if (!allowedJsxText.test(node.text)) {
        violations.jsxText.push(node.text.trim());
      }
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      checkCjk(node.text);
    } else if (ts.isTemplateExpression(node)) {
      checkCjk(node.head.text);
      for (const span of node.templateSpans) {
        checkCjk(span.literal.text);
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
}

const inspections = sourceFiles.map((file) => ({ file, violations: inspect(file) }));

const describeFile = (file: string): string => file.slice(repositoryRoot.length);

describe('renderer conventions', () => {
  it('keeps user-visible Chinese out of components (message tables only)', () => {
    const offenders = inspections
      .filter((entry) => entry.violations.cjk.length > 0)
      .map((entry) => `${describeFile(entry.file)}: ${entry.violations.cjk.join(' | ')}`);

    expect(offenders).toEqual([]);
  });

  it('keeps JSX text nodes free of hard-coded copy', () => {
    const offenders = inspections
      .filter((entry) => entry.violations.jsxText.length > 0)
      .map((entry) => `${describeFile(entry.file)}: ${entry.violations.jsxText.join(' | ')}`);

    expect(offenders).toEqual([]);
  });

  it('keeps colour literals out of component sources', () => {
    const offenders = sourceFiles.filter((file) => colorLiteral.test(readFileSync(file, 'utf8')));

    expect(offenders.map(describeFile)).toEqual([]);
  });

  it('only consumes tokens the design system declares', () => {
    const tokensCss = readFileSync(join(uiRoot, 'tokens.css'), 'utf8');
    const shellCss = readFileSync(join(rendererRoot, 'styles.css'), 'utf8');
    const tableStyleSource = readFileSync(join(uiRoot, 'table-style.ts'), 'utf8');
    const declared = new Set<string>();
    for (const match of tokensCss.matchAll(/(--cs-[a-z0-9-]+)\s*:/g)) {
      const name = match[1];
      if (name !== undefined) {
        declared.add(name);
      }
    }
    const tableVariables = new Set<string>();
    for (const match of tableStyleSource.matchAll(/'(--cs-table-[a-z0-9-]+)'/g)) {
      const name = match[1];
      if (name !== undefined) {
        tableVariables.add(name);
      }
    }

    const used = new Set<string>();
    for (const match of shellCss.matchAll(/var\((--cs-[a-z0-9-]+)\)/g)) {
      const name = match[1];
      if (name !== undefined) {
        used.add(name);
      }
    }

    expect(used.size).toBeGreaterThan(10);
    expect([...used].some((name) => name.startsWith('--cs-table-'))).toBe(true);
    for (const name of used) {
      if (name.startsWith('--cs-table-')) {
        expect(tableVariables.has(name), `styles.css uses unknown ${name}`).toBe(true);
      } else {
        expect(declared.has(name), `styles.css uses undeclared ${name}`).toBe(true);
      }
    }
    expect(shellCss.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(colorLiteral);
  });
});
