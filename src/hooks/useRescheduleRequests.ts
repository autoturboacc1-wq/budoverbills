import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface RescheduleRequest {
  id: string;
  installment_id: string;
  agreement_id: string;
  requested_by: string;
  new_due_date: string;
  original_due_date: string;
  reschedule_fee: number;
  fee_installments: number;
  fee_per_installment: number;
  original_fee_rate: number;
  applied_fee_rate: number;
  safeguard_applied: boolean;
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  slip_url: string | null;
  submitted_amount: number | null;
  created_at: string;
  updated_at: string;
}

interface CreateRescheduleInput {
  installmentId: string;
  agreementId: string;
  originalDueDate: string;
  newDueDate: string;
  principalPerInstallment: number; // เงินต้นต่องวด (principal / numInstallments)
  interestPerInstallment: number; // ดอกเบี้ยต่องวด (สำหรับ Flat/Effective)
  currentInterestRate: number;
  interestType: 'none' | 'flat' | 'effective';
  feeInstallments: number;
  customFeeRate?: number; // For no-interest: % of principal (1-20%), For interest: % of interest to prepay (10-100%)
  slipUrl?: string; // URL ของสลิปการโอนค่าเลื่อนงวด
  submittedAmount?: number; // จำนวนเงินที่ลูกหนี้ระบุว่าโอน
}

interface FeeCalculation {
  baseFeeRate: number | null; // null for interest-based fee
  appliedFeeRate: number | null;
  totalFee: number;
  feePerInstallment: number;
  safeguardApplied: boolean;
  combinedRate: number;
  feeType: 'percentage' | 'prepay_interest'; // percentage = % of principal, prepay_interest = pay interest upfront
  interestPrepayPercent?: number; // % ของดอกเบี้ยที่จ่ายล่วงหน้า (10-100%)
}

type RpcClient = (
  fn: string,
  params?: Record<string, unknown>
) => Promise<{ data: unknown; error: Error | null }>;

const MAX_ANNUAL_RATE = 15; // 15% per year max by Thai law
const BASE_RESCHEDULE_FEE_RATE = 5; // 5% per request

export function useRescheduleRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<RescheduleRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const getErrorMessage = useCallback((error: unknown, fallback: string) => {
    if (error instanceof Error) {
      return error.message || fallback;
    }

    return fallback;
  }, []);

  // Calculate fee based on interest type
  // - none: ใช้ % ของค่างวด (customFeeRate 1-20%)
  // - flat/effective: จ่ายดอกเบี้ยงวดนั้นล่วงหน้า (customFeeRate = % ของดอก 10-100%)
  const calculateRescheduleFee = useCallback((
    principalPerInstallment: number,
    interestPerInstallment: number,
    currentInterestRate: number,
    interestType: 'none' | 'flat' | 'effective',
    feeInstallments: number,
    customFeeRate?: number // For no-interest: % of principal, For interest: % of interest to prepay
  ): FeeCalculation => {
    // For agreements WITH interest: fee = pay interest portion upfront (10-100%)
    // This is NOT extra interest - it's "ตัดดอกก่อน" (pay interest first)
    if (interestType !== 'none') {
      const interestPrepayPercent = customFeeRate !== undefined ? customFeeRate : 100;
      const totalFee = Math.ceil((interestPerInstallment * interestPrepayPercent) / 100);
      const feePerInstallment = Math.ceil(totalFee / feeInstallments);
      
      return {
        baseFeeRate: null,
        appliedFeeRate: null,
        totalFee,
        feePerInstallment,
        safeguardApplied: false, // Not applicable - prepaying doesn't add cost
        combinedRate: currentInterestRate, // Rate stays the same
        feeType: 'prepay_interest',
        interestPrepayPercent
      };
    }
    
    // For no-interest agreements: use percentage of principal with safeguard
    const baseFeeRate = customFeeRate !== undefined ? customFeeRate : BASE_RESCHEDULE_FEE_RATE;
    
    // Calculate theoretical annual rate if this fee were applied frequently
    // Safeguard: if the fee rate would cause total reschedule fees to exceed 15% of principal annually
    // we cap it to prevent exceeding legal limits
    const theoreticalAnnualRate = baseFeeRate * 12; // Assuming monthly reschedules
    const safeguardApplied = theoreticalAnnualRate > MAX_ANNUAL_RATE;
    const appliedFeeRate = safeguardApplied 
      ? Math.max(1, Math.floor(MAX_ANNUAL_RATE / 12)) // Cap at ~1.25% per request max
      : baseFeeRate;
    
    const totalFee = Math.ceil((principalPerInstallment * appliedFeeRate) / 100);
    const feePerInstallment = Math.ceil(totalFee / feeInstallments);
    
    return {
      baseFeeRate,
      appliedFeeRate,
      totalFee,
      feePerInstallment,
      safeguardApplied,
      combinedRate: appliedFeeRate,
      feeType: 'percentage'
    };
  }, []);

  // Fetch requests for an agreement
  const fetchRequests = useCallback(async (agreementId: string) => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reschedule_requests')
        .select('*')
        .eq('agreement_id', agreementId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setRequests((data || []) as RescheduleRequest[]);
    } catch (error) {
      console.error('Error fetching reschedule requests:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Create a new reschedule request
  const createRequest = useCallback(async (input: CreateRescheduleInput): Promise<boolean> => {
    if (!user) return false;
    
    try {
      const rpc = supabase.rpc as unknown as RpcClient;
      const { error } = await rpc('create_reschedule_request', {
        p_installment_id: input.installmentId,
        p_agreement_id: input.agreementId,
        p_original_due_date: input.originalDueDate,
        p_new_due_date: input.newDueDate,
        p_principal_per_installment: input.principalPerInstallment,
        p_interest_per_installment: input.interestPerInstallment,
        p_current_interest_rate: input.currentInterestRate,
        p_interest_type: input.interestType,
        p_fee_installments: input.feeInstallments,
        p_custom_fee_rate: input.customFeeRate ?? null,
        p_slip_url: input.slipUrl ?? null,
        p_submitted_amount: input.submittedAmount ?? null,
      });
      
      if (error) throw error;
      
      toast.success('ส่งคำขอเลื่อนงวดเรียบร้อย');
      return true;
    } catch (error) {
      console.error('Error creating reschedule request:', error);
      toast.error('ไม่สามารถส่งคำขอได้');
      return false;
    }
  }, [user]);

  // Approve a request (lender only) - updates installment due_date, shifts ALL subsequent installments, and creates fee installments
  const approveRequest = useCallback(async (requestId: string): Promise<boolean> => {
    if (!user) return false;
    
    try {
      const rpc = supabase.rpc as unknown as RpcClient;
      const { data, error } = await rpc('approve_reschedule_request', {
        p_request_id: requestId,
      });

      if (error) throw error;

      const shiftedCount = typeof data === 'object' && data !== null && 'shifted_count' in data
        ? Number((data as { shifted_count: number }).shifted_count)
        : 0;

      toast.success(`อนุมัติเรียบร้อย! เลื่อนงวดที่ขอและงวดถัดไปอีก ${Math.max(0, shiftedCount - 1)} งวด`);
      return true;
    } catch (error: unknown) {
      console.error('Error approving request:', error);
      toast.error(getErrorMessage(error, 'ไม่สามารถอนุมัติได้'));
      return false;
    }
  }, [user, getErrorMessage]);

  // Reject a request (lender only)
  const rejectRequest = useCallback(async (requestId: string, reason?: string): Promise<boolean> => {
    if (!user) return false;
    
    try {
      const rpc = supabase.rpc as unknown as RpcClient;
      const { error } = await rpc('reject_reschedule_request', {
        p_request_id: requestId,
        p_rejection_reason: reason ?? null,
      });
      
      if (error) throw error;
      
      toast.success('ปฏิเสธคำขอเลื่อนงวดเรียบร้อย');
      return true;
    } catch (error: unknown) {
      console.error('Error rejecting request:', error);
      toast.error('ไม่สามารถปฏิเสธได้');
      return false;
    }
  }, [user]);

  // Cancel a pending request (borrower only)
  const cancelRequest = useCallback(async (requestId: string): Promise<boolean> => {
    if (!user) return false;
    
    try {
      const { error } = await supabase
        .from('reschedule_requests')
        .delete()
        .eq('id', requestId)
        .eq('requested_by', user.id)
        .eq('status', 'pending');
      
      if (error) throw error;
      
      toast.success('ยกเลิกคำขอเรียบร้อย');
      return true;
    } catch (error: unknown) {
      console.error('Error canceling request:', error);
      toast.error('ไม่สามารถยกเลิกได้');
      return false;
    }
  }, [user]);

  return {
    requests,
    loading,
    fetchRequests,
    createRequest,
    approveRequest,
    rejectRequest,
    cancelRequest,
    calculateRescheduleFee
  };
}
