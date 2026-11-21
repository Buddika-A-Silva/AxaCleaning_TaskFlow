export type CalendarTaskRange = { start_date?: string | null; due_date: string };

export function formatMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function formatDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseMonthKey(monthKey: string): { year: number; month: number } {
  const parts = /^(\d{4})-(\d{2})$/.exec(monthKey);
  const yearPart = parts?.[1];
  const monthPart = parts?.[2];
  const year = Number(yearPart);
  const month = Number(monthPart);
  if (!yearPart || !monthPart || !Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Invalid calendar month: ${monthKey}`);
  }
  return { year, month };
}

export function getMonthCalendarDays(monthKey: string): Date[] {
  const { year, month } = parseMonthKey(monthKey);
  const firstDay = new Date(year, month - 1, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const dayCount = new Date(year, month, 0).getDate();
  const cellCount = Math.ceil((startOffset + dayCount) / 7) * 7;
  return Array.from({ length: cellCount }, (_, index) => new Date(year, month - 1, index - startOffset + 1));
}

export function taskOccursOnCalendarDay(task: CalendarTaskRange, dayKey: string): boolean {
  return (task.start_date ?? task.due_date) <= dayKey && task.due_date >= dayKey;
}
