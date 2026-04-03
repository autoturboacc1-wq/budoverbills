import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import {
  calculateRemainingAmount,
  getUserRoleInAgreement,
} from '@/domains/debt';
import type {
  AgreementFrequency,
  AgreementStatus,
  CreateAgreementInput,
  DebtAgreement,
  Installment,
  InstallmentStatus,
  InterestType,
} from '@/domains/debt/types';
import { getErrorMessage, handleSupabaseError } from '@/utils/errorHandler';
import { isWithinMoneyTolerance, sumMoney, toMoney } from '@/utils/money';

export type { Installment, DebtAgreement, CreateAgreementInput } from '@/domains/debt/types';

type ProfileRow = Tables<'profiles'>;
type InstallmentRow = Tables<'installments'>;
type DebtAgreementSecureRow = Tables<'debt_agreements_secure'> & {
  installments: InstallmentRow[] | null;
  transfer_slip_url?: string | null;
  transferred_at?: string | null;
  borrower_confirmed_transfer?: boolean | null;
  borrower_confirmed_transfer_at?: string | null;
  agreement_text?: string | null;
  lender_confirmed_ip?: string | null;
  lender_confirmed_device?: string | null;
  borrower_confirmed_ip?: string | null;
  borrower_confirmed_device?: string | null;
};

type ProfileMap = Record<string, { avatar_url: string | null; display_name: string | null }>;

const DEFAULT_MONEY_TOLERANCE = 0.01;

function isInterestType(value: string | null): value is InterestType {
  return value === 'none' || value === 'flat' || value === 'effective';
}

function isAgreementFrequency(value: string | null): value is AgreementFrequency {
  return value === 'daily' || value === 'weekly' || value === 'monthly';
}

function isAgreementStatus(value: string | null): value is AgreementStatus {
  return (
    value === 'pending_confirmation' ||
    value === 'active' ||
    value === 'completed' ||
    value === 'cancelled' ||
    value === 'rescheduling'
  );
}

function isInstallmentStatus(value: string): value is InstallmentStatus {
  return value === 'pending' || value === 'paid' || value === 'overdue' || value === 'rescheduled';
}

function mapInstallmentRow(row: InstallmentRow): Installment {
  return {
    id: row.id,
    agreement_id: row.agreement_id,
    installment_number: row.installment_number,
    due_date: row.due_date,
    original_due_date: row.original_due_date,
    amount: toMoney(row.amount),
    principal_portion: toMoney(row.principal_portion),
    interest_portion: toMoney(row.interest_portion ?? 0),
    status: isInstallmentStatus(row.status) ? row.status : 'pending',
    paid_at: row.paid_at,
    payment_proof_url: row.payment_proof_url,
    confirmed_by_lender: row.confirmed_by_lender ?? false,
  };
}

function mapAgreementRow(row: DebtAgreementSecureRow, profileMap: ProfileMap): DebtAgreement | null {
  if (!row.id || !row.lender_id) {
    return null;
  }

  return {
    id: row.id,
    created_at: row.created_at ?? new Date(0).toISOString(),
    updated_at: row.updated_at ?? row.created_at ?? new Date(0).toISOString(),
    lender_id: row.lender_id,
    borrower_id: row.borrower_id,
    borrower_phone: row.borrower_phone,
    borrower_name: row.borrower_name,
    principal_amount: toMoney(row.principal_amount ?? 0),
    interest_rate: toMoney(row.interest_rate ?? 0),
    interest_type: isInterestType(row.interest_type) ? row.interest_type : 'none',
    total_amount: toMoney(row.total_amount ?? 0),
    num_installments: row.num_installments ?? 0,
    frequency: isAgreementFrequency(row.frequency) ? row.frequency : 'monthly',
    start_date: row.start_date ?? new Date().toISOString().split('T')[0],
    status: isAgreementStatus(row.status) ? row.status : 'pending_confirmation',
    lender_confirmed: row.lender_confirmed ?? false,
    borrower_confirmed: row.borrower_confirmed ?? false,
    description: row.description,
    reschedule_fee_rate: row.reschedule_fee_rate ? toMoney(row.reschedule_fee_rate) : undefined,
    reschedule_interest_multiplier: row.reschedule_interest_multiplier ?? undefined,
    bank_name: row.bank_name,
    account_number: row.account_number,
    account_name: row.account_name,
    installments: (row.installments ?? []).map(mapInstallmentRow),
    lender_avatar_url: profileMap[row.lender_id]?.avatar_url ?? null,
    borrower_avatar_url: row.borrower_id ? profileMap[row.borrower_id]?.avatar_url ?? null : null,
    lender_display_name: profileMap[row.lender_id]?.display_name ?? null,
    transfer_slip_url: row.transfer_slip_url ?? null,
    transferred_at: row.transferred_at ?? null,
    borrower_confirmed_transfer: row.borrower_confirmed_transfer ?? false,
    borrower_confirmed_transfer_at: row.borrower_confirmed_transfer_at ?? null,
    agreement_text: row.agreement_text ?? null,
    lender_confirmed_ip: row.lender_confirmed_ip ?? null,
    lender_confirmed_device: row.lender_confirmed_device ?? null,
    borrower_confirmed_ip: row.borrower_confirmed_ip ?? null,
    borrower_confirmed_device: row.borrower_confirmed_device ?? null,
  };
}

export function useDebtAgreements() {
  const [agreements, setAgreements] = useState<DebtAgreement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const fetchAgreements = useCallback(async () => {
    if (!user) {
      setAgreements([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase
        .from('debt_agreements_secure')
        .select(`
          *,
          installments (*)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const agreementRows = (data ?? []) as DebtAgreementSecureRow[];
      const userIds = new Set<string>();

      agreementRows.forEach((agreement) => {
        if (agreement.lender_id) {
          userIds.add(agreement.lender_id);
        }
        if (agreement.borrower_id) {
          userIds.add(agreement.borrower_id);
        }
      });

      const profileMap: ProfileMap = {};

      if (userIds.size > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id, avatar_url, display_name')
          .in('user_id', Array.from(userIds));

        if (profilesError) {
          throw profilesError;
        }

        (profiles ?? []).forEach((profile: ProfileRow) => {
          profileMap[profile.user_id] = {
            avatar_url: profile.avatar_url,
            display_name: profile.display_name,
          };
        });
      }

      const mappedData = agreementRows
        .map((agreement) => mapAgreementRow(agreement, profileMap))
        .filter((agreement): agreement is DebtAgreement => agreement !== null);

      setAgreements(mappedData);
    } catch (error) {
      handleSupabaseError(error, 'fetch-agreements', 'ไม่สามารถโหลดข้อมูลข้อตกลงได้');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void fetchAgreements();
  }, [fetchAgreements]);

  const createAgreement = async (input: CreateAgreementInput) => {
    if (!user) {
      toast.error('กรุณาเข้าสู่ระบบก่อน');
      return null;
    }

    if (input.borrower_id && input.borrower_id === user.id) {
      toast.error('ไม่สามารถสร้างข้อตกลงกับตัวเองได้');
      return null;
    }

    const installmentSum = sumMoney(...input.installments.map((installment) => toMoney(installment.amount)));

    if (!isWithinMoneyTolerance(installmentSum, input.total_amount, DEFAULT_MONEY_TOLERANCE)) {
      toast.error('ยอดรวมงวดไม่ตรงกับยอดสัญญา');
      return null;
    }

    try {
      const agreementInsert: TablesInsert<'debt_agreements'> = {
        lender_id: user.id,
        borrower_id: input.borrower_id ?? null,
        borrower_phone: input.borrower_phone ?? null,
        borrower_name: input.borrower_name ?? null,
        principal_amount: toMoney(input.principal_amount),
        interest_rate: toMoney(input.interest_rate),
        interest_type: input.interest_type,
        total_amount: toMoney(input.total_amount),
        num_installments: input.num_installments,
        frequency: input.frequency,
        start_date: input.start_date,
        description: input.description ?? null,
        reschedule_fee_rate: input.reschedule_fee_rate ?? 5,
        reschedule_interest_multiplier: input.reschedule_interest_multiplier ?? 1,
        bank_name: input.bank_name ?? null,
        account_number: input.account_number ?? null,
        account_name: input.account_name ?? null,
        lender_confirmed: true,
      };

      const { data: agreement, error: agreementError } = await supabase
        .from('debt_agreements')
        .insert(agreementInsert)
        .select()
        .single();

      if (agreementError) {
        throw agreementError;
      }

      const installmentsToInsert: TablesInsert<'installments'>[] = input.installments.map((installment) => ({
        agreement_id: agreement.id,
        installment_number: installment.installment_number,
        due_date: installment.due_date,
        amount: toMoney(installment.amount),
        principal_portion: toMoney(installment.principal_portion),
        interest_portion: toMoney(installment.interest_portion),
      }));

      const { error: installmentsError } = await supabase.from('installments').insert(installmentsToInsert);

      if (installmentsError) {
        throw installmentsError;
      }

      await fetchAgreements();
      return agreement;
    } catch (error) {
      handleSupabaseError(error, 'create-agreement', `ไม่สามารถสร้างข้อตกลงได้: ${getErrorMessage(error)}`);
      return null;
    }
  };

  const getAgreementByInstallmentId = useCallback((installmentId: string) => {
    return agreements.find((agreement) =>
      agreement.installments?.some((installment) => installment.id === installmentId)
    );
  }, [agreements]);

  const updateInstallmentStatus = async (
    installmentId: string,
    status: InstallmentStatus,
    paymentProofUrl?: string
  ) => {
    if (!user) {
      toast.error('กรุณาเข้าสู่ระบบก่อน');
      return false;
    }

    const agreement = getAgreementByInstallmentId(installmentId);
    if (!agreement) {
      toast.error('ไม่พบข้อมูลงวดที่ต้องการอัปเดต');
      return false;
    }

    if (getUserRoleInAgreement(agreement, user.id) !== 'lender') {
      toast.error('เฉพาะเจ้าหนี้เท่านั้นที่อัปเดตสถานะการชำระได้');
      return false;
    }

    try {
      const updates: TablesUpdate<'installments'> = { status };

      if (status === 'paid') {
        updates.paid_at = new Date().toISOString();
      }
      if (paymentProofUrl) {
        updates.payment_proof_url = paymentProofUrl;
      }

      const { error } = await supabase.from('installments').update(updates).eq('id', installmentId);

      if (error) {
        throw error;
      }

      await fetchAgreements();
      return true;
    } catch (error) {
      handleSupabaseError(error, 'update-installment-status', 'ไม่สามารถอัปเดตสถานะได้');
      return false;
    }
  };

  const uploadSlip = async (installmentId: string, slipUrl: string) => {
    if (!user) {
      toast.error('กรุณาเข้าสู่ระบบก่อน');
      return false;
    }

    const agreement = getAgreementByInstallmentId(installmentId);
    if (!agreement) {
      toast.error('ไม่พบข้อมูลงวดที่ต้องการอัปโหลดสลิป');
      return false;
    }

    if (getUserRoleInAgreement(agreement, user.id) !== 'borrower') {
      toast.error('เฉพาะผู้ยืมเท่านั้นที่อัปโหลดสลิปได้');
      return false;
    }

    const installment = agreement.installments?.find((item) => item.id === installmentId);
    if (!installment || installment.status === 'paid' || installment.confirmed_by_lender) {
      toast.error('งวดนี้ถูกยืนยันแล้ว ไม่สามารถอัปโหลดสลิปใหม่ได้');
      return false;
    }

    try {
      const updates: TablesUpdate<'installments'> = {
        payment_proof_url: slipUrl,
        status: 'pending',
      };

      const { error } = await supabase.from('installments').update(updates).eq('id', installmentId);

      if (error) {
        throw error;
      }

      await fetchAgreements();
      return true;
    } catch (error) {
      handleSupabaseError(error, 'upload-slip', 'ไม่สามารถอัปเดตสลิปได้');
      return false;
    }
  };

  const confirmPayment = async (installmentId: string) => {
    if (!user) {
      toast.error('กรุณาเข้าสู่ระบบก่อน');
      return false;
    }

    const agreement = getAgreementByInstallmentId(installmentId);
    if (!agreement) {
      toast.error('ไม่พบข้อมูลงวดที่ต้องการยืนยัน');
      return false;
    }

    if (getUserRoleInAgreement(agreement, user.id) !== 'lender') {
      toast.error('เฉพาะเจ้าหนี้เท่านั้นที่ยืนยันการชำระได้');
      return false;
    }

    try {
      const { data: installmentData, error: fetchError } = await supabase
        .from('installments')
        .select('agreement_id')
        .eq('id', installmentId)
        .single();

      if (fetchError) {
        throw fetchError;
      }

      const { error } = await supabase
        .from('installments')
        .update({
          confirmed_by_lender: true,
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .eq('id', installmentId);

      if (error) {
        throw error;
      }

      const { data: allInstallments, error: checkError } = await supabase
        .from('installments')
        .select('status')
        .eq('agreement_id', installmentData.agreement_id);

      if (!checkError && allInstallments) {
        const allPaid = allInstallments.every((installment) => installment.status === 'paid');

        if (allPaid) {
          const { data: agreementData } = await supabase
            .from('debt_agreements')
            .select('lender_id, borrower_id, principal_amount')
            .eq('id', installmentData.agreement_id)
            .single();

          const { error: completeError } = await supabase
            .from('debt_agreements')
            .update({ status: 'completed' })
            .eq('id', installmentData.agreement_id);

          if (!completeError && agreementData) {
            toast.success('🎉 ข้อตกลงสิ้นสุดสมบูรณ์!');

            const formattedAmount = toMoney(agreementData.principal_amount).toLocaleString();

            await supabase.from('notifications').insert({
              user_id: agreementData.lender_id,
              type: 'agreement_completed',
              title: '🎉 ข้อตกลงเงินกู้สิ้นสุดสมบูรณ์',
              message: `ข้อตกลงมูลค่า ฿${formattedAmount} ได้รับการชำระครบถ้วนแล้ว`,
              related_id: installmentData.agreement_id,
              related_type: 'agreement',
            });

            if (agreementData.borrower_id) {
              await supabase.from('notifications').insert({
                user_id: agreementData.borrower_id,
                type: 'agreement_completed',
                title: '🎉 ชำระหนี้ครบถ้วน',
                message: `คุณได้ชำระหนี้มูลค่า ฿${formattedAmount} ครบถ้วนแล้ว ขอบคุณ!`,
                related_id: installmentData.agreement_id,
                related_type: 'agreement',
              });
            }
          }
        }
      }

      await fetchAgreements();
      toast.success('ยืนยันการชำระเรียบร้อย');
      return true;
    } catch (error) {
      handleSupabaseError(error, 'confirm-payment', 'ไม่สามารถยืนยันได้');
      return false;
    }
  };

  const getAgreement = useCallback(
    (agreementId: string) => agreements.find((agreement) => agreement.id === agreementId),
    [agreements]
  );

  const getActiveAgreements = useCallback(() => agreements.filter((agreement) => agreement.status === 'active'), [agreements]);

  const getPendingAgreements = useCallback(
    () => agreements.filter((agreement) => agreement.status === 'pending_confirmation'),
    [agreements]
  );

  const stats = {
    totalToReceive: sumMoney(
      ...agreements
        .filter((agreement) => getUserRoleInAgreement(agreement, user?.id) === 'lender' && agreement.status === 'active')
        .map((agreement) => calculateRemainingAmount(agreement.installments))
    ),
    totalToPay: sumMoney(
      ...agreements
        .filter((agreement) => getUserRoleInAgreement(agreement, user?.id) === 'borrower' && agreement.status === 'active')
        .map((agreement) => calculateRemainingAmount(agreement.installments))
    ),
    activeCount: agreements.filter((agreement) => agreement.status === 'active').length,
    pendingCount: agreements.filter((agreement) => agreement.status === 'pending_confirmation').length,
  };

  return {
    agreements,
    isLoading,
    createAgreement,
    updateInstallmentStatus,
    uploadSlip,
    confirmPayment,
    getAgreement,
    getActiveAgreements,
    getPendingAgreements,
    stats,
    refresh: fetchAgreements,
  };
}
