import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('CSV export', () => {
  it('escapes quotes and line breaks in spreadsheet cells', () => {
    expect(toCsv([{ title: 'He said "yes"\nnext' }], [{ key: 'title', label: 'Task' }]))
      .toBe('"Task"\r\n"He said ""yes"" next"');
  });

  it('emits a header for empty authorised result sets', () => {
    expect(toCsv([], [{ key: 'reference', label: 'Reference' }])).toBe('"Reference"');
  });
});