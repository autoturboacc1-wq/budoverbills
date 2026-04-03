import { describe, expect, it } from 'vitest';
import {
  divideMoney,
  isWithinMoneyTolerance,
  moneyEquals,
  roundMoney,
  subtractMoney,
  sumMoney,
  toMoney,
} from '@/utils/money';

describe('money utils', () => {
  it('rounds to 2 decimal places', () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(1.335)).toBe(1.34);
  });

  it('throws on invalid value', () => {
    expect(() => toMoney('abc')).toThrow();
  });

  it('throws on negative value by default', () => {
    expect(() => toMoney(-100)).toThrow();
  });

  it('sums decimal values safely', () => {
    expect(sumMoney(0.1, 0.2)).toBe(0.3);
  });

  it('subtracts money safely', () => {
    expect(subtractMoney(10, 9.7)).toBe(0.3);
  });

  it('compares with cent tolerance', () => {
    expect(moneyEquals(100, 100.001)).toBe(true);
    expect(moneyEquals(100, 100.009)).toBe(true);
    expect(isWithinMoneyTolerance(100, 100.02)).toBe(false);
  });

  it('divides with 2-decimal normalization', () => {
    expect(divideMoney(100, 3)).toBe(33.33);
  });
});
