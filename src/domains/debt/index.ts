/**
 * Debt Domain - SINGLE SOURCE OF TRUTH for all debt-related business logic
 * 
 * UI components MUST use these functions instead of:
 * - Direct status comparisons
 * - Date calculations in components
 * - Amount calculations in components
 * - Role checks with userId comparisons
 */

// Types
export * from './types';

// Role functions
export { 
  getUserRoleInAgreement, 
  isUserLender, 
  isUserBorrower 
} from '@/domains/role/getUserRoleInAgreement';

// Amount calculations
export { 
  calculateRemainingAmount, 
  calculatePaidAmount,
  calculateInterestPaid,
  calculatePrincipalPaid,
  countPaidInstallments,
  isAgreementEffectivelyCompleted
} from './calculateRemainingAmount';

// Installment functions
export { 
  getNextInstallment, 
  formatDueDate, 
  calculateDaysUntilDue,
  isInstallmentOverdue,
  getOverdueInstallments,
  isAgreementOverdue 
} from './getNextInstallment';

// Status functions
export { 
  getAgreementDisplayStatus, 
  getDebtCardStatus,
  needsUserConfirmation 
} from './getAgreementDisplayStatus';

// Mapping functions
export { 
  getPartnerName,
  getPartnerAvatarUrl,
  mapAgreementToDebtCard, 
  mapAgreementsToDebtCards,
  mapToUpcomingInstallments,
  mapToCompletedAgreements 
} from './mapAgreementToDebtCard';
