import { describe, expect, it } from 'vitest';
import i18n from './i18n';
import en from './i18n/en.json';

describe('English-only interface', () => {
  it('initializes English as the only translation resource', () => {
    expect(i18n.language).toBe('en');
    expect(i18n.options.resources).toHaveProperty('en');
    expect(i18n.options.resources).not.toHaveProperty('ro');
  });

  it('does not contain empty translation strings', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value.trim(), key).not.toBe('');
    }
  });
});
