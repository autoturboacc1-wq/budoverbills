import type { DebtAgreement, Installment } from '@/domains/debt/types';

export function createInstallment(overrides: Partial<Installment> = {}): Installment {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    agreement_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    installment_number: 1,
    due_date: '2026-04-10',
    original_due_date: null,
    amount: 1000,
    principal_portion: 900,
    interest_portion: 100,
    status: 'pending',
    paid_at: null,
    payment_proof_url: null,
    confirmed_by_lender: false,
    ...overrides,
  };
}

export function createAgreement(overrides: Partial<DebtAgreement> = {}): DebtAgreement {
  return {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-02T00:00:00.000Z',
    lender_id: 'lender-id',
    borrower_id: 'borrower-id',
    borrower_phone: '0812345678',
    borrower_name: 'ผู้ยืม',
    principal_amount: 3000,
    interest_rate: 12,
    interest_type: 'flat',
    // Keep the default total aligned with the installment fixture sum.
    total_amount: 3000,
    num_installments: 3,
    frequency: 'monthly',
    start_date: '2026-04-01',
    status: 'active',
    lender_confirmed: true,
    borrower_confirmed: true,
    description: null,
    reschedule_fee_rate: 5,
    reschedule_interest_multiplier: 1,
    bank_name: null,
    account_number: null,
    account_name: null,
    installments: [
      createInstallment(),
      createInstallment({
        id: '22222222-2222-2222-2222-222222222222',
        installment_number: 2,
        due_date: '2026-05-10',
      }),
      createInstallment({
        id: '33333333-3333-3333-3333-333333333333',
        installment_number: 3,
        due_date: '2026-06-10',
      }),
    ],
    lender_avatar_url: 'lender-avatar',
    borrower_avatar_url: 'borrower-avatar',
    lender_display_name: 'ผู้ให้ยืม',
    transfer_slip_url: 'transfer-slip.jpg',
    transferred_at: '2026-04-01T01:00:00.000Z',
    borrower_confirmed_transfer: true,
    borrower_confirmed_transfer_at: '2026-04-01T02:00:00.000Z',
    agreement_text: null,
    lender_confirmed_ip: null,
    lender_confirmed_device: null,
    borrower_confirmed_ip: null,
    borrower_confirmed_device: null,
    ...overrides,
  };
}
