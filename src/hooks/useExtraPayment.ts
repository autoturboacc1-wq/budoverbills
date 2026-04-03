import { useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { DebtAgreement, Installment } from '@/domains/debt/types';
import { recalculateEffectiveRateSchedule } from '@/domains/debt/recalculateEffectiveRateSchedule';
import { getErrorMessage, handleSupabaseError } from '@/utils/errorHandler';
import { roundMoney, subtractMoney, sumMoney, toMoney } from '@/utils/money';

interface ExtraPaymentResult {
  success: boolean;
  principalReduction: number;
  installmentsClosed: number;
  newLastInstallmentAmount?: number;
  interestSaved?: number;
}

type RpcClient = (
  fn: string,
  params?: Record<string, unknown>
) => Promise<{ data: unknown; error: Error | null }>;

function getUnpaidPrincipalInstallments(agreement: DebtAgreement): Installment[] {
  return (agreement.installments ?? [])
    .filter((installment) => installment.status !== 'paid' && installment.principal_portion > 0)
    .sort((a, b) => b.installment_number - a.installment_number);
}

export function useExtraPayment() {
  const { user } = useAuth();

  /**
   * Process extra payment:
   * 1. ตัดเงินต้นก่อน
   * 2. ปิดงวดท้ายๆ ที่สามารถปิดได้
   * 3. ถ้า Effective Rate → คำนวณดอกเบี้ยใหม่จากเงินต้นคงเหลือ
   * 4. ถ้า Flat Rate → ดอกเบี้ยคงเดิม ไม่เปลี่ยน
   */
  const processExtraPayment = useCallback(
    async (
      agreement: DebtAgreement,
      extraAmount: number,
      onSuccess?: () => void
    ): Promise<ExtraPaymentResult> => {
      if (!user) {
        toast.error('กรุณาเข้าสู่ระบบก่อน');
        return { success: false, principalReduction: 0, installmentsClosed: 0 };
      }

      if (!agreement.installments || agreement.installments.length === 0) {
        toast.error('ไม่พบงวดชำระ');
        return { success: false, principalReduction: 0, installmentsClosed: 0 };
      }

      try {
        const rpc = supabase.rpc as unknown as RpcClient;
        const { data, error } = await rpc('process_extra_payment', {
          p_agreement_id: agreement.id,
          p_extra_amount: toMoney(extraAmount),
        });

        if (error) throw error;

        const result = (data ?? {}) as ExtraPaymentResult;

        if (!result.success) {
          toast.error('ไม่มีงวดค้างชำระ');
          return { success: false, principalReduction: 0, installmentsClosed: 0 };
        }

        toast.success(`ชำระเพิ่มเติม ฿${result.principalReduction.toLocaleString()} สำเร็จ`, {
          description:
            result.installmentsClosed > 0 ? `ปิดจบ ${result.installmentsClosed} งวดหลัง` : 'ลดยอดเงินต้นงวดท้าย',
        });

        onSuccess?.();

        return result;
      } catch (error) {
        handleSupabaseError(
          error,
          'extra-payment',
          `ไม่สามารถชำระเพิ่มเติมได้: ${getErrorMessage(error)}`
        );
        return { success: false, principalReduction: 0, installmentsClosed: 0 };
      }
    },
    [user]
  );

  const calculateExtraPaymentPreview = useCallback(
    (
      agreement: DebtAgreement,
      extraAmount: number
    ): {
      principalReduction: number;
      installmentsToClose: number;
      newLastInstallmentAmount: number;
      interestSaved: number;
      remainingInstallments: number;
    } | null => {
      if (!agreement.installments) {
        return null;
      }

      const unpaidInstallments = getUnpaidPrincipalInstallments(agreement);

      if (unpaidInstallments.length === 0) {
        return null;
      }

      const totalRemainingPrincipal = sumMoney(
        ...unpaidInstallments.map((installment) => installment.principal_portion)
      );
      const effectivePayment = roundMoney(Math.min(toMoney(extraAmount), totalRemainingPrincipal));

      let remainingPayment = effectivePayment;
      let installmentsToClose = 0;
      let newLastInstallmentAmount = 0;

      for (const installment of unpaidInstallments) {
        if (remainingPayment <= 0) {
          break;
        }

        if (remainingPayment >= installment.principal_portion) {
          installmentsToClose += 1;
          remainingPayment = subtractMoney(remainingPayment, installment.principal_portion);
          continue;
        }

        const newPrincipal = roundMoney(Math.max(0, subtractMoney(installment.principal_portion, remainingPayment)));
        newLastInstallmentAmount =
          agreement.interest_type === 'flat'
            ? sumMoney(newPrincipal, installment.interest_portion ?? 0)
            : newPrincipal;
        remainingPayment = 0;
      }

      let interestSaved = 0;

      if (agreement.interest_type === 'effective') {
        const remainingAfterClosures = unpaidInstallments
          .slice(installmentsToClose)
          .sort((a, b) => a.installment_number - b.installment_number);
        const currentInterest = sumMoney(
          ...remainingAfterClosures.map((installment) => installment.interest_portion ?? 0)
        );
        const recalculatedInterest = sumMoney(
          ...recalculateEffectiveRateSchedule({
            remainingPrincipal: Math.max(0, subtractMoney(totalRemainingPrincipal, effectivePayment)),
            annualRatePercent: agreement.interest_rate,
            installments: Math.max(0, remainingAfterClosures.length),
            frequency: agreement.frequency,
          }).map((scheduleItem) => scheduleItem.interest)
        );
        interestSaved = roundMoney(Math.max(0, subtractMoney(currentInterest, recalculatedInterest)));
      } else if (agreement.interest_type === 'flat') {
        interestSaved = sumMoney(
          ...unpaidInstallments.slice(0, installmentsToClose).map((installment) => installment.interest_portion ?? 0)
        );
      }

      return {
        principalReduction: effectivePayment,
        installmentsToClose,
        newLastInstallmentAmount,
        interestSaved,
        remainingInstallments: Math.max(0, unpaidInstallments.length - installmentsToClose),
      };
    },
    []
  );

  return {
    processExtraPayment,
    calculateExtraPaymentPreview,
  };
}
