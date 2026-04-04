const MONEY_MULTIPLIER = 100;

interface MoneyOptions {
  allowNegative?: boolean;
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid monetary value: ${value}`);
  }

  const normalized = Math.abs(value).toFixed(12);
  const [wholePart, fractionPart = ''] = normalized.split('.');
  const digits = `${fractionPart}000000000000`;
  const cents = Number(digits.slice(0, 2));
  const roundingDigit = Number(digits[2] ?? '0');
  const roundedCents = cents + (roundingDigit >= 5 ? 1 : 0);
  const roundedWhole = Number(wholePart) + Math.floor(roundedCents / MONEY_MULTIPLIER);
  const finalCents = roundedCents % MONEY_MULTIPLIER;
  const result = Number(`${roundedWhole}.${finalCents.toString().padStart(2, '0')}`);
  const signed = value < 0 ? -result : result;
  return Object.is(signed, -0) ? 0 : signed;
}

export function toMoney(value: unknown, options: MoneyOptions = {}): number {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    throw new Error(`Invalid monetary value: ${String(value)}`);
  }

  const num = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(num)) {
    throw new Error(`Invalid monetary value: ${String(value)}`);
  }

  if (!options.allowNegative && num < 0) {
    throw new Error(`Negative monetary value: ${String(value)}`);
  }

  return roundMoney(num);
}

export function toMoneyCents(value: number): number {
  const normalized = toMoney(value).toFixed(2);
  const sign = normalized.startsWith('-') ? -1 : 1;
  const digits = normalized.replace('-', '').replace('.', '');
  return sign * Number(digits);
}

export function sumMoney(...values: number[]): number {
  const totalCents = values.reduce((sum, value) => sum + toMoneyCents(value), 0);
  return roundMoney(totalCents / MONEY_MULTIPLIER);
}

export function subtractMoney(a: number, b: number): number {
  return roundMoney((toMoneyCents(a) - toMoneyCents(b)) / MONEY_MULTIPLIER);
}

export function moneyEquals(a: number, b: number, tolerance: number = 0): boolean {
  const toleranceCents = Math.max(0, Math.round(Math.abs(tolerance) * MONEY_MULTIPLIER));
  return Math.abs(toMoneyCents(a) - toMoneyCents(b)) <= toleranceCents;
}

export function isWithinMoneyTolerance(
  actual: number,
  expected: number,
  tolerance: number = 0
): boolean {
  const toleranceCents = Math.max(0, Math.round(Math.abs(tolerance) * MONEY_MULTIPLIER));
  return Math.abs(toMoneyCents(actual) - toMoneyCents(expected)) <= toleranceCents;
}

export function divideMoney(value: number, divisor: number): number {
  if (!Number.isFinite(divisor) || divisor <= 0) {
    throw new Error(`Invalid money divisor: ${divisor}`);
  }

  return roundMoney(toMoney(value) / divisor);
}
