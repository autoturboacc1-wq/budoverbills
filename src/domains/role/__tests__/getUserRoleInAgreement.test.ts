import { describe, expect, it } from 'vitest';
import {
  getUserRoleInAgreement,
  isUserBorrower,
  isUserLender,
} from '@/domains/role/getUserRoleInAgreement';
import { createAgreement } from '@/test/fixtures/debt';

describe('getUserRoleInAgreement', () => {
  const agreement = createAgreement();

  it('returns lender for lender id', () => {
    expect(getUserRoleInAgreement(agreement, 'lender-id')).toBe('lender');
    expect(isUserLender(agreement, 'lender-id')).toBe(true);
  });

  it('returns borrower for borrower id', () => {
    expect(getUserRoleInAgreement(agreement, 'borrower-id')).toBe('borrower');
    expect(isUserBorrower(agreement, 'borrower-id')).toBe(true);
  });

  it('returns null for unrelated user', () => {
    expect(getUserRoleInAgreement(agreement, 'other-user')).toBeNull();
  });
});
