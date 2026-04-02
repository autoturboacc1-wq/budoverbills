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

function getUnpaidPrincipalInstallments(agreement: DebtAgreement): Installment[] {
  return (agreement.installments ?? [])
    .filter((installment) => installment.status !== 'paid' && installment.principal_portion > 0)
    .sort((a, b) => b.installment_number - a.installment_number);
}

export function useExtraPayment() {
  const { user } = useAuth();

  const recalculateRemainingEffectiveInstallments = useCallback(
    async (agreement: DebtAgreement, principalReduction: number, closedInstallmentIds: string[]) => {
      if (!agreement.installments) {
        return;
      }

      const remainingInstallments = agreement.installments
        .filter(
          (installment) =>
            installment.status !== 'paid' &&
            installment.principal_portion > 0 &&
            !closedInstallmentIds.includes(installment.id)
        )
        .sort((a, b) => a.installment_number - b.installment_number);

      if (remainingInstallments.length === 0) {
        return;
      }

      const currentRemainingPrincipal = sumMoney(
        ...remainingInstallments.map((installment) => installment.principal_portion)
      );
      const nextRemainingPrincipal = roundMoney(Math.max(0, subtractMoney(currentRemainingPrincipal, principalReduction)));

      if (nextRemainingPrincipal <= 0) {
        return;
      }

      const nextSchedule = recalculateEffectiveRateSchedule({
        remainingPrincipal: nextRemainingPrincipal,
        annualRatePercent: agreement.interest_rate,
        installments: remainingInstallments.length,
        frequency: agreement.frequency,
      });

      await Promise.all(
        nextSchedule.map((scheduleItem, index) =>
          supabase
            .from('installments')
            .update({
              principal_portion: scheduleItem.principal,
              interest_portion: scheduleItem.interest,
              amount: scheduleItem.total,
            })
            .eq('id', remainingInstallments[index].id)
        )
      );
    },
    []
  );

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
        const unpaidInstallments = getUnpaidPrincipalInstallments(agreement);

        if (unpaidInstallments.length === 0) {
          toast.error('ไม่มีงวดค้างชำระ');
          return { success: false, principalReduction: 0, installmentsClosed: 0 };
        }

        const totalRemainingPrincipal = sumMoney(
          ...unpaidInstallments.map((installment) => installment.principal_portion)
        );
        const effectivePayment = roundMoney(Math.min(toMoney(extraAmount), totalRemainingPrincipal));

        let remainingPayment = effectivePayment;
        const installmentsToPay: string[] = [];
        let lastPartialInstallment: { id: string; newPrincipal: number; newAmount: number } | null = null;

        for (const installment of unpaidInstallments) {
          if (remainingPayment <= 0) {
            break;
          }

          if (remainingPayment >= installment.principal_portion) {
            installmentsToPay.push(installment.id);
            remainingPayment = subtractMoney(remainingPayment, installment.principal_portion);
            continue;
          }

          const newPrincipal = roundMoney(Math.max(0, subtractMoney(installment.principal_portion, remainingPayment)));
          const preservedInterest = agreement.interest_type === 'flat' ? installment.interest_portion ?? 0 : 0;
          lastPartialInstallment = {
            id: installment.id,
            newPrincipal,
            newAmount: sumMoney(newPrincipal, preservedInterest),
          };
          remainingPayment = 0;
        }

        if (installmentsToPay.length > 0) {
          const { error: closeError } = await supabase
            .from('installments')
            .update({
              status: 'paid',
              paid_at: new Date().toISOString(),
              confirmed_by_lender: true,
            })
            .in('id', installmentsToPay);

          if (closeError) {
            throw closeError;
          }
        }

        if (agreement.interest_type === 'effective') {
          await recalculateRemainingEffectiveInstallments(agreement, effectivePayment, installmentsToPay);
        } else if (lastPartialInstallment) {
          const { error: updateError } = await supabase
            .from('installments')
            .update({
              principal_portion: lastPartialInstallment.newPrincipal,
              amount: lastPartialInstallment.newAmount,
            })
            .eq('id', lastPartialInstallment.id);

          if (updateError) {
            throw updateError;
          }
        }

        toast.success(`ชำระเพิ่มเติม ฿${effectivePayment.toLocaleString()} สำเร็จ`, {
          description:
            installmentsToPay.length > 0 ? `ปิดจบ ${installmentsToPay.length} งวดหลัง` : 'ลดยอดเงินต้นงวดท้าย',
        });

        onSuccess?.();

        return {
          success: true,
          principalReduction: effectivePayment,
          installmentsClosed: installmentsToPay.length,
          newLastInstallmentAmount: lastPartialInstallment?.newAmount,
        };
      } catch (error) {
        handleSupabaseError(
          error,
          'extra-payment',
          `ไม่สามารถชำระเพิ่มเติมได้: ${getErrorMessage(error)}`
        );
        return { success: false, principalReduction: 0, installmentsClosed: 0 };
      }
    },
    [recalculateRemainingEffectiveInstallments, user]
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
