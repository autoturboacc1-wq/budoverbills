import { Status as StatusBadgeStatus } from '@/components/ui/StatusBadge';

export type InstallmentStatus = 'pending' | 'paid' | 'overdue' | 'rescheduled';
export type InterestType = 'none' | 'flat' | 'effective';
export type AgreementFrequency = 'daily' | 'weekly' | 'monthly';
export type AgreementStatus =
  | 'pending_confirmation'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'rescheduling';

export interface Installment {
  id: string;
  agreement_id: string;
  installment_number: number;
  due_date: string;
  original_due_date: string | null;
  amount: number;
  principal_portion: number;
  interest_portion: number;
  status: InstallmentStatus;
  paid_at: string | null;
  payment_proof_url: string | null;
  confirmed_by_lender: boolean;
}

export interface DebtAgreement {
  id: string;
  created_at: string;
  updated_at: string;
  lender_id: string;
  borrower_id: string | null;
  borrower_phone: string | null;
  borrower_name: string | null;
  principal_amount: number;
  interest_rate: number;
  interest_type: InterestType;
  total_amount: number;
  num_installments: number;
  frequency: AgreementFrequency;
  start_date: string;
  status: AgreementStatus;
  lender_confirmed: boolean;
  borrower_confirmed: boolean;
  description: string | null;
  reschedule_fee_rate?: number;
  reschedule_interest_multiplier?: number;
  bank_name?: string | null;
  account_number?: string | null;
  account_name?: string | null;
  installments?: Installment[];
  lender_avatar_url?: string | null;
  borrower_avatar_url?: string | null;
  lender_display_name?: string | null;
  transfer_slip_url?: string | null;
  transferred_at?: string | null;
  borrower_confirmed_transfer?: boolean;
  borrower_confirmed_transfer_at?: string | null;
  agreement_text?: string | null;
  lender_confirmed_ip?: string | null;
  lender_confirmed_device?: string | null;
  lender_confirmed_at?: string | null;
  borrower_confirmed_ip?: string | null;
  borrower_confirmed_device?: string | null;
  borrower_confirmed_at?: string | null;
  contract_finalized_at?: string | null;
  contract_hash?: string | null;
  contract_template_version?: string | null;
}

export interface CreateAgreementInstallmentInput {
  installment_number: number;
  due_date: string;
  amount: number;
  principal_portion: number;
  interest_portion: number;
}

export interface CreateAgreementInput {
  borrower_id?: string;
  borrower_phone?: string;
  borrower_name?: string;
  invitation_token?: string;
  principal_amount: number;
  interest_rate: number;
  interest_type: InterestType;
  total_amount: number;
  num_installments: number;
  frequency: AgreementFrequency;
  start_date: string;
  description?: string;
  reschedule_fee_rate?: number;
  reschedule_interest_multiplier?: number;
  bank_name?: string;
  account_number?: string;
  account_name?: string;
  installments: CreateAgreementInstallmentInput[];
}

/**
 * Display status for debt cards and UI components
 * Derived from agreement and installment data
 * Must be compatible with StatusBadge component
 */
export type DebtDisplayStatus = StatusBadgeStatus;

/**
 * DebtCard status type (limited set for card display)
 */
export type DebtCardStatus = 'pending' | 'paid' | 'overdue' | 'negotiating';

/**
 * User role in an agreement
 */
export type AgreementRole = 'lender' | 'borrower';

/**
 * Processed data ready for DebtCard component
 */
export interface DebtCardData {
  id: string;
  partnerName: string;
  partnerInitial: string;
  partnerAvatarUrl: string | null;
  amount: number;
  remainingAmount: number;
  nextPaymentDate: string;
  installmentProgress: {
    current: number;
    total: number;
  };
  status: DebtDisplayStatus;
  isLender: boolean;
  delay: number;
}

/**
 * Upcoming installment data for dashboard
 */
export interface UpcomingInstallmentData {
  agreementId: string;
  partnerName: string;
  amount: number;
  dueDate: string;
  daysUntilDue: number;
  isLender: boolean;
}

/**
 * Completed agreement summary data
 */
export interface CompletedAgreementData {
  id: string;
  partnerName: string;
  isLender: boolean;
  principalAmount: number;
  totalAmount: number;
  interestPaid: number;
  installmentsPaid: number;
  totalInstallments: number;
  completedDate: string;
  startDate: string;
}
