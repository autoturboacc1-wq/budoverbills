import { describe, expect, it } from 'vitest';
import { getAgreementDisplayStatus } from '@/domains/debt/getAgreementDisplayStatus';
import { mapAgreementToDebtCard } from '@/domains/debt/mapAgreementToDebtCard';
import { createAgreement } from '@/test/fixtures/debt';

describe('status + card integration', () => {
  it('keeps card status aligned with display status', () => {
    const agreement = createAgreement({ status: 'rescheduling' });
    const status = getAgreementDisplayStatus(agreement);
    const card = mapAgreementToDebtCard(agreement, 'lender-id');

    expect(status).toBe('negotiating');
    expect(card.status).toBe('negotiating');
  });
});
