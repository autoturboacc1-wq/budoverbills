import { describe, expect, it } from 'vitest';
import {
  divideMoney,
  isWithinMoneyTolerance,
  moneyEquals,
  roundMoney,
  subtractMoney,
  sumMoney,
  toMoney,
  toMoneyCents,
} from '@/utils/money';

describe('money utils', () => {
  it('rounds to 2 decimal places', () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(1.335)).toBe(1.34);
  });

  it('throws on invalid value', () => {
    expect(() => toMoney('abc')).toThrow();
    expect(() => toMoney(null)).toThrow();
  });

  it('throws on negative value by default', () => {
    expect(() => toMoney(-100)).toThrow();
  });

  it('allows negative values when explicitly enabled', () => {
    expect(toMoney(-100, { allowNegative: true })).toBe(-100);
  });

  it('sums decimal values safely', () => {
    expect(sumMoney(0.1, 0.2)).toBe(0.3);
  });

  it('subtracts money safely', () => {
    expect(subtractMoney(10, 9.7)).toBe(0.3);
  });

  it('compares exactly by default and only allows explicit tolerance', () => {
    expect(moneyEquals(100, 100.001)).toBe(true);
    expect(moneyEquals(100, 100.009)).toBe(false);
    expect(moneyEquals(100, 100.009, 0.01)).toBe(true);
    expect(isWithinMoneyTolerance(100, 100.009)).toBe(false);
    expect(isWithinMoneyTolerance(100, 100.009, 0.01)).toBe(true);
  });

  it('divides with 2-decimal normalization', () => {
    expect(divideMoney(100, 3)).toBe(33.33);
  });

  it('converts to integer cents without floating drift', () => {
    expect(toMoneyCents(10.235)).toBe(1024);
    expect(toMoneyCents(1.005)).toBe(101);
  });

  it('throws on invalid divisors', () => {
    expect(() => divideMoney(100, 0)).toThrow();
    expect(() => divideMoney(100, -2)).toThrow();
  });
});
