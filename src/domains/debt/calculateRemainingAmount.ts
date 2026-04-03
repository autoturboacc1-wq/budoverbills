import { Installment } from '@/domains/debt/types';
import { sumMoney } from '@/utils/money';

/**
 * SINGLE SOURCE OF TRUTH for calculating remaining amount to be paid.
 * 
 * @param installments - Array of installments
 * @returns Total amount remaining (unpaid installments)
 */
export function calculateRemainingAmount(installments: Installment[] | undefined): number {
  if (!installments || installments.length === 0) {
    return 0;
  }

  return sumMoney(
    ...installments.filter((installment) => installment.status !== 'paid').map((installment) => installment.amount)
  );
}

/**
 * Calculate paid amount from installments
 */
export function calculatePaidAmount(installments: Installment[] | undefined): number {
  if (!installments || installments.length === 0) {
    return 0;
  }

  return sumMoney(...installments.filter((installment) => installment.status === 'paid').map((installment) => installment.amount));
}

/**
 * Calculate total interest paid
 */
export function calculateInterestPaid(installments: Installment[] | undefined): number {
  if (!installments || installments.length === 0) {
    return 0;
  }

  return sumMoney(
    ...installments.filter((installment) => installment.status === 'paid').map((installment) => installment.interest_portion || 0)
  );
}

/**
 * Calculate total principal paid
 */
export function calculatePrincipalPaid(installments: Installment[] | undefined): number {
  if (!installments || installments.length === 0) {
    return 0;
  }

  return sumMoney(
    ...installments.filter((installment) => installment.status === 'paid').map((installment) => installment.principal_portion)
  );
}

/**
 * Count paid installments
 */
export function countPaidInstallments(installments: Installment[] | undefined): number {
  if (!installments || installments.length === 0) {
    return 0;
  }

  return installments.filter((installment) => installment.status === 'paid').length;
}

/**
 * Check if all installments are paid (agreement effectively completed)
 * This is used to filter out "completed" agreements from active views
 * even if the status hasn't been manually changed to 'completed'
 */
export function isAgreementEffectivelyCompleted(installments: Installment[] | undefined): boolean {
  if (!installments || installments.length === 0) {
    return false;
  }

  return installments.every((installment) => installment.status === 'paid');
}
