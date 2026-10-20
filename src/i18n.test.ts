import { describe, expect, it } from 'vitest';
import en from './i18n/en.json';
import ro from './i18n/ro.json';

function flattenKeys(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return child && typeof child === 'object' && !Array.isArray(child)
      ? flattenKeys(child as Record<string, unknown>, path)
      : [path];
  });
}

describe('English and Romanian resources', () => {
  it('have identical translation keys', () => {
    expect(flattenKeys(en).sort()).toEqual(flattenKeys(ro).sort());
  });

  it('do not contain empty strings', () => {
    for (const [key, value] of Object.entries({ ...en, ...ro })) {
      expect(value, key).not.toBe('');
    }
  });
});
