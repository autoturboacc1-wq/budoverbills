import { DebtAgreement, AgreementRole } from '@/domains/debt/types';

type RoleAwareAgreement = Pick<DebtAgreement, 'lender_id' | 'borrower_id'>;

/**
 * SINGLE SOURCE OF TRUTH for determining user role in an agreement.
 * 
 * @param agreement - The debt agreement
 * @param userId - The user ID to check
 * @returns 'lender' | 'borrower' | null if user is not part of the agreement
 */
export function getUserRoleInAgreement(
  agreement: RoleAwareAgreement | null | undefined,
  userId: string | undefined
): AgreementRole | null {
  if (!userId || !agreement) return null;
  
  if (agreement.lender_id === userId) {
    return 'lender';
  }
  
  if (agreement.borrower_id === userId) {
    return 'borrower';
  }
  
  return null;
}

/**
 * Check if user is the lender in an agreement
 */
export function isUserLender(agreement: RoleAwareAgreement, userId: string | undefined): boolean {
  return getUserRoleInAgreement(agreement, userId) === 'lender';
}

/**
 * Check if user is the borrower in an agreement
 */
export function isUserBorrower(agreement: RoleAwareAgreement, userId: string | undefined): boolean {
  return getUserRoleInAgreement(agreement, userId) === 'borrower';
}
