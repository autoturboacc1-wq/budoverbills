import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAgreementDisplayStatus, needsUserConfirmation } from '@/domains/debt/getAgreementDisplayStatus';
import { createAgreement } from '@/test/fixtures/debt';

describe('getAgreementDisplayStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns completed for completed agreements', () => {
    expect(getAgreementDisplayStatus(createAgreement({ status: 'completed' }))).toBe('completed');
  });

  it('returns awaiting_transfer_confirmation when transfer exists but borrower has not confirmed', () => {
    expect(
      getAgreementDisplayStatus(
        createAgreement({
          status: 'pending_confirmation',
          lender_confirmed: true,
          transfer_slip_url: 'some/path',
          borrower_confirmed_transfer: false,
          contract_finalized_at: '2026-04-01T00:00:00.000Z',
        })
      )
    ).toBe('awaiting_transfer_confirmation');
  });

  it('returns active for active agreements with pending installments', () => {
    expect(getAgreementDisplayStatus(createAgreement())).toBe('active');
  });

  it('returns cancelled for cancelled agreements', () => {
    expect(getAgreementDisplayStatus(createAgreement({ status: 'cancelled' }))).toBe('cancelled');
  });

  it('returns overdue when next installment is overdue', () => {
    expect(
      getAgreementDisplayStatus(
        createAgreement({
          installments: [createAgreement().installments![0]!, { ...createAgreement().installments![1]!, due_date: '2020-01-01' }],
        })
      )
    ).toBe('overdue');
  });

  it('returns completed when all installments are paid', () => {
    expect(
      getAgreementDisplayStatus(
        createAgreement({
          installments: createAgreement().installments?.map((installment) => ({ ...installment, status: 'paid' })),
        })
      )
    ).toBe('completed');
  });

  it('returns completed when all installments are rescheduled', () => {
    expect(
      getAgreementDisplayStatus(
        createAgreement({
          installments: createAgreement().installments?.map((installment) => ({ ...installment, status: 'rescheduled' })),
        })
      )
    ).toBe('completed');
  });
});

describe('needsUserConfirmation', () => {
  it('returns correct confirmation requirement per role', () => {
    const pendingAgreement = createAgreement({
      status: 'pending_confirmation',
      lender_confirmed: false,
      borrower_confirmed: true,
    });

    expect(needsUserConfirmation(pendingAgreement, 'lender-id', true)).toBe(true);
    expect(needsUserConfirmation(pendingAgreement, 'borrower-id', false)).toBe(false);
  });
});
