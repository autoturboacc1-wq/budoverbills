import { describe, expect, it } from 'vitest';
import {
  buildEffectiveRateSchedule,
  getPeriodsPerYear,
  recalculateEffectiveRateSchedule,
} from '@/domains/debt/recalculateEffectiveRateSchedule';

describe('recalculateEffectiveRateSchedule', () => {
  it('returns correct periods per year', () => {
    expect(getPeriodsPerYear('daily')).toBe(365);
    expect(getPeriodsPerYear('weekly')).toBe(52);
    expect(getPeriodsPerYear('monthly')).toBe(12);
  });

  it('creates equal-principal schedule for zero interest', () => {
    const schedule = buildEffectiveRateSchedule({
      principal: 300,
      annualRatePercent: 0,
      installments: 3,
      frequency: 'monthly',
    });

    expect(schedule).toHaveLength(3);
    expect(schedule.every((item) => item.interest === 0)).toBe(true);
    expect(schedule.reduce((sum, item) => sum + item.principal, 0)).toBe(300);
  });

  it('recalculates positive-interest schedule with normalized totals', () => {
    const schedule = recalculateEffectiveRateSchedule({
      remainingPrincipal: 1000,
      annualRatePercent: 12,
      installments: 4,
      frequency: 'monthly',
    });

    expect(schedule).toHaveLength(4);
    expect(schedule[0].interest).toBeGreaterThan(0);
    expect(schedule.reduce((sum, item) => sum + item.principal, 0)).toBeCloseTo(1000, 2);
  });

  it('preserves annual rate precision beyond 2 decimal places', () => {
    const schedule = buildEffectiveRateSchedule({
      principal: 10000,
      annualRatePercent: 12.345,
      installments: 1,
      frequency: 'monthly',
    });

    expect(schedule).toHaveLength(1);
    expect(schedule[0].interest).toBe(102.88);
    expect(schedule[0].total).toBe(10102.88);
  });
});
