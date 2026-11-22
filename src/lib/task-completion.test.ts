import { describe, expect, it } from 'vitest';
import { hasCompletionPhoto } from './task-completion';

describe('task completion photos', () => {
  it('requires a completion photo, not an assignment photo', () => {
    expect(hasCompletionPhoto([{ photo_type: 'assignment' }])).toBe(false);
  });

  it('accepts one completion photo from any teammate', () => {
    expect(hasCompletionPhoto([
      { photo_type: 'assignment' },
      { photo_type: 'completion' },
    ])).toBe(true);
  });
});
