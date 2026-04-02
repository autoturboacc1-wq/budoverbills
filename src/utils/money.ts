const MONEY_MULTIPLIER = 100;

interface MoneyOptions {
  allowNegative?: boolean;
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid monetary value: ${value}`);
  }

  return Math.round((value + Number.EPSILON) * MONEY_MULTIPLIER) / MONEY_MULTIPLIER;
}

export function toMoney(value: unknown, options: MoneyOptions = {}): number {
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
  return Math.round(roundMoney(value) * MONEY_MULTIPLIER);
}

export function sumMoney(...values: number[]): number {
  const totalCents = values.reduce((sum, value) => sum + toMoneyCents(value), 0);
  return totalCents / MONEY_MULTIPLIER;
}

export function subtractMoney(a: number, b: number): number {
  return (toMoneyCents(a) - toMoneyCents(b)) / MONEY_MULTIPLIER;
}

export function moneyEquals(a: number, b: number, tolerance: number = 0.01): boolean {
  return Math.abs(toMoney(a, { allowNegative: true }) - toMoney(b, { allowNegative: true })) <= tolerance;
}

export function isWithinMoneyTolerance(
  actual: number,
  expected: number,
  tolerance: number = 0.01
): boolean {
  return Math.abs(subtractMoney(actual, expected)) <= tolerance;
}

export function divideMoney(value: number, divisor: number): number {
  if (!Number.isFinite(divisor) || divisor <= 0) {
    throw new Error(`Invalid money divisor: ${divisor}`);
  }

  return roundMoney(toMoney(value) / divisor);
}
