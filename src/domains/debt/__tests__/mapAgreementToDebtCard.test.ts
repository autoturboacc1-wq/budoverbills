import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mapAgreementToDebtCard,
  mapAgreementsToDebtCards,
  mapToCompletedAgreements,
  mapToUpcomingInstallments,
} from '@/domains/debt/mapAgreementToDebtCard';
import { createAgreement, createInstallment } from '@/test/fixtures/debt';

describe('mapAgreementToDebtCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-15T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps lender view correctly', () => {
    const agreement = createAgreement();
    const card = mapAgreementToDebtCard(agreement, 'lender-id', 2);

    expect(card.partnerName).toBe('ผู้ยืม');
    expect(card.partnerAvatarUrl).toBe('borrower-avatar');
    expect(card.remainingAmount).toBe(3000);
    expect(card.installmentProgress).toEqual({ current: 0, total: 3 });
    expect(card.delay).toBe(0.6000000000000001);
  });

  it('maps collections and completed agreements', () => {
    const active = createAgreement();
    const completed = createAgreement({
      id: 'completed',
      status: 'completed',
      installments: createAgreement().installments?.map((installment) => ({
        ...installment,
        status: 'paid',
        paid_at: '2026-06-10T00:00:00.000Z',
      })),
    });

    expect(mapAgreementsToDebtCards([active], 'lender-id')).toHaveLength(1);
    expect(mapToCompletedAgreements([active, completed], 'lender-id')).toHaveLength(1);
  });

  it('maps upcoming installments sorted by urgency', () => {
    const agreement = createAgreement({
      installments: [
        createInstallment({ id: 'stale', due_date: '2026-03-01', amount: 100, status: 'pending' }),
        createInstallment({ id: 'late', due_date: '2026-04-16', amount: 500 }),
        createInstallment({ id: 'later', due_date: '2026-04-20', amount: 700 }),
      ],
    });

    const upcoming = mapToUpcomingInstallments([agreement], 'lender-id', 1, 10);
    expect(upcoming.map((item) => item.amount)).toEqual([100, 500]);
    expect(upcoming).toHaveLength(2);
  });
});
