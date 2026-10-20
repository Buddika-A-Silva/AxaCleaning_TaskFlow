export function toCsv(rows: Array<Record<string, string | number | null | undefined>>, columns: Array<{ key: string; label: string }>): string {
  const cell = (value: string | number | null | undefined) => {
    const normalized = String(value ?? '').replace(/\r?\n/g, ' ');
    const safe = /^[=+\-@\t\r]/.test(normalized) ? `'${normalized}` : normalized;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return [columns.map(column => cell(column.label)).join(','), ...rows.map(row => columns.map(column => cell(row[column.key])).join(','))].join('\r\n');
}
