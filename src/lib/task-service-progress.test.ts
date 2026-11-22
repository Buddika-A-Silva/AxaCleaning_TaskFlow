import { describe, expect, it } from 'vitest';
import { hasHoursForEveryService } from './task-service-progress';

describe('team service progress', () => {
  it('accepts hours recorded by one worker for each selected service', () => {
    expect(hasHoursForEveryService(['kitchen', 'bathroom'], [
      { selection_id: 'kitchen', actual_hours: 0.5 },
      { selection_id: 'bathroom', actual_hours: 1 },
    ])).toBe(true);
  });

  it('requires an hours entry for every selected service', () => {
    expect(hasHoursForEveryService(['kitchen', 'bathroom'], [
      { selection_id: 'kitchen', actual_hours: 0.5 },
      { selection_id: 'bathroom', actual_hours: null },
    ])).toBe(false);
  });
});
