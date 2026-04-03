import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateDaysUntilDue,
  getNextInstallment,
  getOverdueInstallments,
  isAgreementOverdue,
  isInstallmentOverdue,
} from '@/domains/debt/getNextInstallment';
import { createInstallment } from '@/test/fixtures/debt';

describe('getNextInstallment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for undefined input', () => {
    expect(getNextInstallment(undefined)).toBeNull();
  });

  it('returns earliest unpaid installment', () => {
    const next = getNextInstallment([
      createInstallment({ id: '2', due_date: '2026-06-01', status: 'pending' }),
      createInstallment({ id: '1', due_date: '2026-04-20', status: 'overdue' }),
      createInstallment({ id: '3', due_date: '2026-04-01', status: 'paid' }),
    ]);

    expect(next?.id).toBe('1');
  });

  it('detects overdue installments', () => {
    expect(isInstallmentOverdue(createInstallment({ due_date: '2026-04-10', status: 'pending' }))).toBe(true);
    expect(isInstallmentOverdue(createInstallment({ due_date: '2026-04-20', status: 'pending' }))).toBe(false);
    expect(isInstallmentOverdue(createInstallment({ due_date: '2026-04-15', status: 'pending' }))).toBe(false);
    expect(isInstallmentOverdue(createInstallment({ due_date: '2026-04-10', status: 'paid' }))).toBe(false);
  });

  it('returns overdue installment list and agreement overdue flag', () => {
    const installments = [
      createInstallment({ id: '1', due_date: '2026-04-10', status: 'pending' }),
      createInstallment({ id: '2', due_date: '2026-04-20', status: 'pending' }),
    ];

    expect(getOverdueInstallments(installments)).toHaveLength(1);
    expect(isAgreementOverdue(installments)).toBe(true);
  });

  it('calculates days until due date', () => {
    expect(calculateDaysUntilDue('2026-04-18')).toBe(3);
  });

  it('treats due dates as Bangkok calendar days', () => {
    vi.setSystemTime(new Date('2026-04-15T01:00:00.000Z'));
    expect(calculateDaysUntilDue('2026-04-16')).toBe(1);
    expect(isInstallmentOverdue(createInstallment({ due_date: '2026-04-15', status: 'pending' }))).toBe(false);
  });
});
