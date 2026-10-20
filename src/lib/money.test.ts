import { describe, expect, it } from 'vitest';
import { budgetBalance, calculateLineTotal, formatMoney, sumMoney } from './money';

describe('decimal-safe money helpers', () => {
  it('calculates line totals without binary floating point drift', () => {
    expect(calculateLineTotal('0.1', '0.2')).toBe('0.02');
    expect(calculateLineTotal('3', '19.99')).toBe('59.97');
  });

  it('sums currency amounts exactly', () => {
    expect(sumMoney(['0.10', '0.20', '1.99'])).toBe('2.29');
  });

  it('returns remaining budget and overage without negative remaining', () => {
    expect(budgetBalance('100.00', '125.25')).toEqual({ remaining: '0.00', overage: '25.25' });
    expect(budgetBalance('100.00', '32.10')).toEqual({ remaining: '67.90', overage: '0.00' });
    expect(budgetBalance(null, '500')).toEqual({ remaining: null, overage: '0.00' });
  });

  it('formats locale-aware currency with a minor unit', () => {
    expect(formatMoney('1234.50', 'EUR', 'ro-RO')).toContain('1.234,50');
    expect(formatMoney('1234.50', 'EUR', 'en-GB')).toContain('1,234.50');
  });
});
