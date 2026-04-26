import { DebtAgreement, DebtCardData, UpcomingInstallmentData, CompletedAgreementData } from '@/domains/debt/types';
import { isUserLender } from '@/domains/role/getUserRoleInAgreement';
import { calculateRemainingAmount, countPaidInstallments, calculateInterestPaid, isAgreementEffectivelyCompleted } from './calculateRemainingAmount';
import { getNextInstallment, formatDueDate, calculateDaysUntilDue } from './getNextInstallment';
import { getDebtCardStatus, isAgreementPaymentReady } from './getAgreementDisplayStatus';

/**
 * Get partner name based on user role
 */
export function getPartnerName(agreement: DebtAgreement, userId: string | undefined): string {
  const isLender = isUserLender(agreement, userId);
  
  if (isLender) {
    return agreement.borrower_name || 'ผู้ยืม';
  }
  
  return agreement.lender_display_name || 'ผู้ให้ยืม';
}

/**
 * Get partner avatar URL based on user role
 */
export function getPartnerAvatarUrl(agreement: DebtAgreement, userId: string | undefined): string | null {
  const isLender = isUserLender(agreement, userId);
  
  if (isLender) {
    return agreement.borrower_avatar_url || null;
  }
  
  return agreement.lender_avatar_url || null;
}

/**
 * SINGLE SOURCE OF TRUTH for mapping agreement data to DebtCard props.
 * 
 * This function processes raw agreement data into a format ready for UI rendering.
 * UI components should consume this data without additional processing.
 * 
 * @param agreement - The debt agreement
 * @param userId - Current user ID
 * @param index - Index for animation delay calculation
 * @returns Data ready for DebtCard component
 */
export function mapAgreementToDebtCard(
  agreement: DebtAgreement,
  userId: string | undefined,
  index: number = 0
): DebtCardData {
  const isLender = isUserLender(agreement, userId);
  const partnerName = getPartnerName(agreement, userId);
  const partnerAvatarUrl = getPartnerAvatarUrl(agreement, userId);
  
  const paidCount = countPaidInstallments(agreement.installments);
  const totalInstallments = agreement.num_installments;
  
  const nextInstallment = getNextInstallment(agreement.installments);
  const remainingAmount = calculateRemainingAmount(agreement.installments);
  
  const status = getDebtCardStatus(agreement);
  
  return {
    id: agreement.id,
    partnerName,
    partnerInitial: partnerName.charAt(0).toUpperCase(),
    partnerAvatarUrl,
    amount: agreement.total_amount,
    remainingAmount,
    nextPaymentDate: nextInstallment 
      ? formatDueDate(nextInstallment.due_date)
      : '-',
    installmentProgress: {
      current: paidCount,
      total: totalInstallments,
    },
    status,
    isLender,
    delay: Math.min(1.2, 0.4 + index * 0.1),
  };
}

/**
 * Map multiple agreements to DebtCard data
 */
export function mapAgreementsToDebtCards(
  agreements: DebtAgreement[],
  userId: string | undefined
): DebtCardData[] {
  return agreements.map((agreement, index) => 
    mapAgreementToDebtCard(agreement, userId, index)
  );
}

/**
 * Map agreement to upcoming installment data for dashboard
 */
export function mapToUpcomingInstallments(
  agreements: DebtAgreement[],
  userId: string | undefined,
  maxDaysAhead: number = 7,
  limit: number = 3
): UpcomingInstallmentData[] {
  const upcoming: UpcomingInstallmentData[] = [];
  
  agreements.forEach((agreement) => {
    if (!isAgreementPaymentReady(agreement)) return;
    
    const isLender = isUserLender(agreement, userId);
    const partnerName = getPartnerName(agreement, userId);
    
    (agreement.installments || []).forEach((installment) => {
      if (installment.status === 'paid' || installment.status === 'rescheduled') return;
      
      const daysUntilDue = calculateDaysUntilDue(installment.due_date);
      
      // Include every overdue installment, but only upcoming items within the lookahead window.
      if (daysUntilDue < 0 || daysUntilDue <= maxDaysAhead) {
        upcoming.push({
          agreementId: agreement.id,
          partnerName,
          amount: installment.amount,
          dueDate: installment.due_date,
          daysUntilDue,
          isLender,
        });
      }
    });
  });
  
  // Sort by urgency (most urgent first)
  return upcoming
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue)
    .slice(0, limit);
}

/**
 * Map completed agreements for history page
 * Includes both:
 * - Agreements with status === 'completed'
 * - Agreements with status === 'active' but all installments are paid (effectively completed)
 */
export function mapToCompletedAgreements(
  agreements: DebtAgreement[],
  userId: string | undefined
): CompletedAgreementData[] {
  return agreements
    .filter(a => 
      a.status === 'completed' || 
      (a.status === 'active' && isAgreementEffectivelyCompleted(a.installments))
    )
    .map(agreement => {
      const isLender = isUserLender(agreement, userId);
      const installments = agreement.installments || [];
      const paidInstallments = installments.filter(i => i.status === 'paid');
      
      // Get the latest payment date as completed date
      const completedDate = paidInstallments.length > 0
        ? paidInstallments.reduce((latest, i) => {
            const paidAt = i.paid_at ? new Date(i.paid_at) : new Date(0);
            return paidAt > latest ? paidAt : latest;
          }, new Date(0)).toISOString()
        : agreement.updated_at;
      
      const interestPaid = calculateInterestPaid(installments);
      
      return {
        id: agreement.id,
        partnerName: getPartnerName(agreement, userId),
        isLender,
        principalAmount: agreement.principal_amount,
        totalAmount: agreement.total_amount,
        interestPaid,
        installmentsPaid: paidInstallments.length,
        totalInstallments: agreement.num_installments,
        completedDate,
        startDate: agreement.start_date,
      };
    })
    .sort((a, b) => new Date(b.completedDate).getTime() - new Date(a.completedDate).getTime());
}
