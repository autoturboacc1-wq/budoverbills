import { DebtAgreement, DebtDisplayStatus } from '@/domains/debt/types';
import { getNextInstallment, isInstallmentOverdue } from './getNextInstallment';

interface AgreementPaymentReadiness {
  status?: string | null;
  borrower_confirmed?: boolean | null;
  lender_confirmed?: boolean | null;
  transfer_slip_url?: string | null;
  borrower_confirmed_transfer?: boolean | null;
}

export function isAgreementPaymentReady(agreement: AgreementPaymentReadiness | null | undefined): boolean {
  if (!agreement) return false;

  return (
    (agreement.status === 'active' || agreement.status === 'rescheduling') &&
    agreement.borrower_confirmed === true &&
    agreement.lender_confirmed === true &&
    Boolean(agreement.transfer_slip_url) &&
    agreement.borrower_confirmed_transfer === true
  );
}

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
    if (!agreement.contract_finalized_at) {
      return 'pending_confirmation';
    }

    if (agreement.lender_confirmed && agreement.transfer_slip_url && !agreement.borrower_confirmed_transfer) {
      return 'awaiting_transfer_confirmation';
    }
    return 'pending_confirmation';
  }
  
  if (agreement.status === 'cancelled') {
    return 'cancelled';
  }
  
  if (agreement.status === 'rescheduling') {
    return 'negotiating';
  }
  
  // For active agreements, check installments
  if (agreement.status === 'active') {
    if (!isAgreementPaymentReady(agreement)) {
      return getAgreementDisplayStatus({
        ...agreement,
        status: 'pending_confirmation',
      });
    }

    const nextInstallment = getNextInstallment(agreement.installments);
    
    // All payable installments are cleared
    if (!nextInstallment) {
      return 'completed';
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
    return agreement.borrower_confirmed && !agreement.lender_confirmed;
  }
  
  if (!agreement.borrower_confirmed) {
    return true;
  }

  return Boolean(
    agreement.lender_confirmed &&
    agreement.transfer_slip_url &&
    !agreement.borrower_confirmed_transfer
  );
}
