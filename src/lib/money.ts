import Decimal from 'decimal.js';

Decimal.set({ precision: 32, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -12, toExpPos: 20 });

export function calculateLineTotal(quantity: string | number, unitAmount: string | number): string {
  return new Decimal(quantity).mul(unitAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

export function sumMoney(values: Array<string | number | null | undefined>): string {
  return values.reduce<Decimal>((total, value) => total.plus(value ?? 0), new Decimal(0)).toFixed(2);
}

export function budgetBalance(budget: string | number | null, spent: string | number): { remaining: string | null; overage: string } {
  if (budget === null) return { remaining: null, overage: '0.00' };
  const balance = new Decimal(budget).minus(spent);
  return { remaining: Decimal.max(0, balance).toFixed(2), overage: Decimal.max(0, balance.negated()).toFixed(2) };
}

export function formatMoney(amount: string | number, currency: string, locale: string): string {
  const decimal = new Decimal(amount);
  const [whole, fraction] = decimal.toFixed(2).split('.');
  const grouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(BigInt(whole ?? '0'));
  const decimalSeparator = new Intl.NumberFormat(locale).formatToParts(1.1).find(part => part.type === 'decimal')?.value ?? '.';
  const currencyLabel = new Intl.DisplayNames([locale], { type: 'currency' }).of(currency) ?? currency;
  return `${grouped}${decimalSeparator}${fraction ?? '00'}\u00a0${currencyLabel}`;
}
