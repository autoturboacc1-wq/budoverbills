import { Installment } from '@/domains/debt/types';

/**
 * SINGLE SOURCE OF TRUTH for getting the next unpaid installment.
 * 
 * @param installments - Array of installments
 * @returns The next unpaid installment sorted by due date, or null if all paid
 */
export function getNextInstallment(installments: Installment[] | undefined): Installment | null {
  if (!installments || installments.length === 0) {
    return null;
  }
  
  const unpaidInstallments = installments.filter(i => i.status !== 'paid');
  
  if (unpaidInstallments.length === 0) {
    return null;
  }
  
  // Sort by due date ascending and return the first one
  return unpaidInstallments.sort(
    (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
  )[0];
}

/**
 * Format due date for display
 */
export function formatDueDate(dueDate: string, locale: string = 'th-TH'): string {
  return new Date(dueDate).toLocaleDateString(locale, { 
    day: 'numeric', 
    month: 'short' 
  });
}

/**
 * Calculate days until due date
 */
export function calculateDaysUntilDue(dueDate: string): number {
  const now = new Date();
  const due = new Date(dueDate);
  return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Check if an installment is overdue
 */
export function isInstallmentOverdue(installment: Installment): boolean {
  if (installment.status === 'paid') {
    return false;
  }
  
  return new Date(installment.due_date) < new Date();
}

/**
 * Get all overdue installments
 */
export function getOverdueInstallments(installments: Installment[] | undefined): Installment[] {
  if (!installments || installments.length === 0) {
    return [];
  }
  
  return installments.filter(isInstallmentOverdue);
}

/**
 * SINGLE SOURCE OF TRUTH for checking if an agreement has any overdue installments.
 * 
 * UI components MUST use this function instead of:
 * - isPast(dueDate) checks
 * - date comparisons with today
 * 
 * @param installments - Array of installments from the agreement
 * @returns true if any unpaid installment is past due date
 */
export function isAgreementOverdue(installments: Installment[] | undefined): boolean {
  return getOverdueInstallments(installments).length > 0;
}
