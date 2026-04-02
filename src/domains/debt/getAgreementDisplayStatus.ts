import { DebtAgreement, DebtDisplayStatus } from '@/domains/debt/types';
import { getNextInstallment, isInstallmentOverdue } from './getNextInstallment';

/**
 * SINGLE SOURCE OF TRUTH for determining display status of an agreement.
 * 
 * UI components MUST use this function instead of:
 * - Direct date comparisons
 * - Checking agreement.status directly
 * - Installment status checks
 * 
 * @param agreement - The debt agreement
 * @returns Display status for UI rendering
 */
export function getAgreementDisplayStatus(agreement: DebtAgreement): DebtDisplayStatus {
  // Check explicit status first
  if (agreement.status === 'completed') {
    return 'completed';
  }
  
  if (agreement.status === 'pending_confirmation') {
    // Check if lender has uploaded transfer slip but borrower hasn't confirmed
    if (agreement.transfer_slip_url && !agreement.borrower_confirmed_transfer) {
      return 'awaiting_transfer_confirmation';
    }
    return 'pending_confirmation';
  }
  
  if (agreement.status === 'cancelled') {
    return 'pending'; // Fallback for cancelled
  }
  
  if (agreement.status === 'rescheduling') {
    return 'negotiating';
  }
  
  // For active agreements, check installments
  if (agreement.status === 'active') {
    const nextInstallment = getNextInstallment(agreement.installments);
    
    // All installments paid
    if (!nextInstallment) {
      return 'paid';
    }
    
    // Check if next installment is overdue
    if (isInstallmentOverdue(nextInstallment)) {
      return 'overdue';
    }
    
    // Active with pending payments
    return 'active';
  }
  
  // Default fallback
  return 'pending';
}

/**
 * Get DebtCard-compatible status
 * DebtCard uses a more limited set of statuses
 */
export function getDebtCardStatus(agreement: DebtAgreement): DebtDisplayStatus {
  const displayStatus = getAgreementDisplayStatus(agreement);
  return displayStatus;
}

/**
 * Check if agreement needs user confirmation
 */
export function needsUserConfirmation(
  agreement: DebtAgreement, 
  userId: string | undefined, 
  isLender: boolean
): boolean {
  if (!userId || agreement.status !== 'pending_confirmation') {
    return false;
  }
  
  if (isLender) {
    return !agreement.lender_confirmed;
  }
  
  return !agreement.borrower_confirmed;
}
