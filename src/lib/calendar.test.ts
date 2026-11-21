import { describe, expect, it } from 'vitest';
import { formatDateKey, formatMonthKey, getMonthCalendarDays, taskOccursOnCalendarDay } from './calendar';

describe('calendar helpers', () => {
  it('creates a Monday-first grid spanning complete weeks', () => {
    const days = getMonthCalendarDays('2026-02');
    const firstDay = days[0];
    const lastDay = days[days.length - 1];

    expect(days).toHaveLength(35);
    expect(firstDay).toBeDefined();
    expect(lastDay).toBeDefined();
    if (!firstDay || !lastDay) throw new Error('Calendar month grid is empty');
    expect(formatDateKey(firstDay)).toBe('2026-01-26');
    expect(formatDateKey(lastDay)).toBe('2026-03-01');
  });

  it('uses local calendar fields when formatting dates and months', () => {
    expect(formatDateKey(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(formatMonthKey(new Date(2026, 0, 31))).toBe('2026-01');
  });

  it('includes tasks on both endpoints of their scheduled date range', () => {
    const task = { start_date: '2026-02-28', due_date: '2026-03-02' };

    expect(taskOccursOnCalendarDay(task, '2026-02-27')).toBe(false);
    expect(taskOccursOnCalendarDay(task, '2026-02-28')).toBe(true);
    expect(taskOccursOnCalendarDay(task, '2026-03-02')).toBe(true);
    expect(taskOccursOnCalendarDay(task, '2026-03-03')).toBe(false);
  });

  it('falls back to the due date when a task has no start date', () => {
    expect(taskOccursOnCalendarDay({ due_date: '2026-02-10' }, '2026-02-10')).toBe(true);
    expect(() => getMonthCalendarDays('2026-13')).toThrow(RangeError);
  });
});
