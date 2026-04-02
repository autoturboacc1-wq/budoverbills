import { describe, expect, it } from 'vitest';
import {
  calculateInterestPaid,
  calculatePaidAmount,
  calculatePrincipalPaid,
  calculateRemainingAmount,
  countPaidInstallments,
  isAgreementEffectivelyCompleted,
} from '@/domains/debt/calculateRemainingAmount';
import { createInstallment } from '@/test/fixtures/debt';

describe('calculateRemainingAmount', () => {
  it('returns 0 for undefined', () => {
    expect(calculateRemainingAmount(undefined)).toBe(0);
  });

  it('returns 0 for empty array', () => {
    expect(calculateRemainingAmount([])).toBe(0);
  });

  it('sums only unpaid installments', () => {
    const installments = [
      createInstallment({ amount: 1000, status: 'paid' }),
      createInstallment({ id: '2', amount: 250.25, status: 'pending' }),
      createInstallment({ id: '3', amount: 749.75, status: 'overdue' }),
    ];
    expect(calculateRemainingAmount(installments)).toBe(1000);
  });
});

describe('other installment totals', () => {
  const installments = [
    createInstallment({
      amount: 1000,
      principal_portion: 900,
      interest_portion: 100,
      status: 'paid',
      paid_at: '2026-04-01T00:00:00.000Z',
    }),
    createInstallment({
      id: '2',
      amount: 800,
      principal_portion: 700,
      interest_portion: 100,
      status: 'paid',
      paid_at: '2026-05-01T00:00:00.000Z',
    }),
    createInstallment({ id: '3', amount: 500, principal_portion: 450, interest_portion: 50, status: 'pending' }),
  ];

  it('calculates paid amount', () => {
    expect(calculatePaidAmount(installments)).toBe(1800);
  });

  it('calculates interest paid', () => {
    expect(calculateInterestPaid(installments)).toBe(200);
  });

  it('calculates principal paid', () => {
    expect(calculatePrincipalPaid(installments)).toBe(1600);
  });

  it('counts paid installments', () => {
    expect(countPaidInstallments(installments)).toBe(2);
  });

  it('detects fully paid agreements', () => {
    expect(isAgreementEffectivelyCompleted(installments)).toBe(false);
    expect(
      isAgreementEffectivelyCompleted(installments.map((installment) => ({ ...installment, status: 'paid' })))
    ).toBe(true);
  });
});
