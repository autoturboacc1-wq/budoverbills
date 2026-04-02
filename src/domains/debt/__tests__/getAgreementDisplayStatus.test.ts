import { describe, expect, it } from 'vitest';
import { getAgreementDisplayStatus, needsUserConfirmation } from '@/domains/debt/getAgreementDisplayStatus';
import { createAgreement } from '@/test/fixtures/debt';

describe('getAgreementDisplayStatus', () => {
  it('returns completed for completed agreements', () => {
    expect(getAgreementDisplayStatus(createAgreement({ status: 'completed' }))).toBe('completed');
  });

  it('returns awaiting_transfer_confirmation when transfer exists but borrower has not confirmed', () => {
    expect(
      getAgreementDisplayStatus(
        createAgreement({
          status: 'pending_confirmation',
          transfer_slip_url: 'some/path',
          borrower_confirmed_transfer: false,
        })
      )
    ).toBe('awaiting_transfer_confirmation');
  });

  it('returns active for active agreements with pending installments', () => {
    expect(getAgreementDisplayStatus(createAgreement())).toBe('active');
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

  it('returns paid when all installments are paid', () => {
    expect(
      getAgreementDisplayStatus(
        createAgreement({
          installments: createAgreement().installments?.map((installment) => ({ ...installment, status: 'paid' })),
        })
      )
    ).toBe('paid');
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
