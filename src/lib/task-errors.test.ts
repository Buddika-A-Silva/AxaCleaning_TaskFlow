import { describe, expect, it } from 'vitest';
import { isDuplicateTaskReferenceError } from './task-errors';

describe('task creation errors', () => {
  it('identifies a duplicate task reference', () => {
    expect(isDuplicateTaskReferenceError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "tasks_organisation_id_reference_key"',
    })).toBe(true);
  });

  it('does not classify unrelated unique violations as duplicate references', () => {
    expect(isDuplicateTaskReferenceError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "other_constraint"',
    })).toBe(false);
    expect(isDuplicateTaskReferenceError({
      code: '42501',
      message: 'tasks_organisation_id_reference_key',
    })).toBe(false);
  });
});
