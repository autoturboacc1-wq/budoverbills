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

const MAX_ANNUAL_RATE = 15; // 15% per year max by Thai law
const BASE_RESCHEDULE_FEE_RATE = 5; // 5% per request

export function useRescheduleRequests() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<RescheduleRequest[]>([]);
  const [loading, setLoading] = useState(false);

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
    } catch (error: any) {
      console.error('Error fetching reschedule requests:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Create a new reschedule request
  const createRequest = useCallback(async (input: CreateRescheduleInput): Promise<boolean> => {
    if (!user) return false;
    
    try {
      const feeCalc = calculateRescheduleFee(
        input.principalPerInstallment,
        input.interestPerInstallment,
        input.currentInterestRate,
        input.interestType,
        input.feeInstallments,
        input.customFeeRate
      );
      
      const { error } = await supabase
        .from('reschedule_requests')
        .insert({
          installment_id: input.installmentId,
          agreement_id: input.agreementId,
          requested_by: user.id,
          original_due_date: input.originalDueDate,
          new_due_date: input.newDueDate,
          reschedule_fee: feeCalc.totalFee,
          fee_installments: 1, // Always 1 now - pay upfront
          fee_per_installment: feeCalc.totalFee,
          original_fee_rate: feeCalc.baseFeeRate,
          applied_fee_rate: feeCalc.appliedFeeRate,
          safeguard_applied: feeCalc.safeguardApplied,
          custom_fee_rate: input.customFeeRate || null,
          slip_url: input.slipUrl || null,
          submitted_amount: input.submittedAmount || null,
          status: 'pending'
        });
      
      if (error) throw error;
      
      toast.success('ส่งคำขอเลื่อนงวดเรียบร้อย');
      return true;
    } catch (error: any) {
      console.error('Error creating reschedule request:', error);
      toast.error('ไม่สามารถส่งคำขอได้');
      return false;
    }
  }, [user, calculateRescheduleFee]);

  // Approve a request (lender only) - updates installment due_date, shifts ALL subsequent installments, and creates fee installments
  const approveRequest = useCallback(async (requestId: string): Promise<boolean> => {
    if (!user) return false;
    
    try {
      // First, get the request details
      const { data: request, error: fetchError } = await supabase
        .from('reschedule_requests')
        .select('*')
        .eq('id', requestId)
        .maybeSingle();
      
      if (fetchError || !request) {
        throw new Error('ไม่พบคำขอเลื่อนงวด');
      }

      // Get the original installment to know its number
      const { data: targetInstallment, error: targetError } = await supabase
        .from('installments')
        .select('installment_number, due_date')
        .eq('id', request.installment_id)
        .maybeSingle();

      if (targetError || !targetInstallment) {
        throw new Error('ไม่พบงวดที่ต้องการเลื่อน');
      }

      // Calculate the number of days to shift
      const originalDate = new Date(request.original_due_date);
      const newDate = new Date(request.new_due_date);
      const daysDiff = Math.round((newDate.getTime() - originalDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Get all installments for this agreement that are >= the target installment number AND not yet paid
      const { data: installmentsToShift, error: shiftError } = await supabase
        .from('installments')
        .select('id, installment_number, due_date, status')
        .eq('agreement_id', request.agreement_id)
        .gte('installment_number', targetInstallment.installment_number)
        .neq('status', 'paid')
        .order('installment_number', { ascending: true });

      if (shiftError) throw shiftError;

      // Update each installment's due_date by shifting it
      for (const inst of (installmentsToShift || [])) {
        const currentDueDate = new Date(inst.due_date);
        currentDueDate.setDate(currentDueDate.getDate() + daysDiff);
        
        const updateData: { due_date: string; status?: string; original_due_date?: string } = {
          due_date: currentDueDate.toISOString().split('T')[0]
        };

        // Reset to pending if it was the target installment (in case it was overdue)
        // Also store the original_due_date for the target installment
        if (inst.id === request.installment_id) {
          updateData.status = 'pending';
          updateData.original_due_date = request.original_due_date;
        }

        const { error: updateInstError } = await supabase
          .from('installments')
          .update(updateData)
          .eq('id', inst.id);
        
        if (updateInstError) throw updateInstError;
      }
      
      // No longer creating fee installments - fee is paid upfront with slip
      
      // Update the reschedule request status
      const { error: updateError } = await supabase
        .from('reschedule_requests')
        .update({
          status: 'approved',
          approved_by: user.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', requestId);
      
      if (updateError) throw updateError;
      
      const shiftedCount = (installmentsToShift || []).length;
      toast.success(`อนุมัติเรียบร้อย! เลื่อนงวดที่ขอและงวดถัดไปอีก ${shiftedCount - 1} งวด`);
      return true;
    } catch (error: any) {
      console.error('Error approving request:', error);
      toast.error(error.message || 'ไม่สามารถอนุมัติได้');
      return false;
    }
  }, [user]);

  // Reject a request (lender only)
  const rejectRequest = useCallback(async (requestId: string, reason?: string): Promise<boolean> => {
    if (!user) return false;
    
    try {
      const { error } = await supabase
        .from('reschedule_requests')
        .update({
          status: 'rejected',
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          rejection_reason: reason || null
        })
        .eq('id', requestId);
      
      if (error) throw error;
      
      toast.success('ปฏิเสธคำขอเลื่อนงวดเรียบร้อย');
      return true;
    } catch (error: any) {
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
    } catch (error: any) {
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
