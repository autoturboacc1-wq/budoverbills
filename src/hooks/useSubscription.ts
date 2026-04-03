import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface AgreementQuota {
  can_create_free: boolean;
  free_used: number;
  free_limit: number;
  free_remaining: number;
  credits: number;
  total_available: number;
  fee_amount: number;
  fee_currency: string;
}

interface SubscriptionInfo {
  is_trial: boolean;
  trial_ends_at: string | null;
  expires_at: string | null;
}

function getDefaultFeeAmount(feeAmount?: number | null): number {
  return typeof feeAmount === "number" && Number.isFinite(feeAmount) ? feeAmount : 29;
}

function getTotalAvailable(freeRemaining: number, credits: number, totalAvailable?: number | null): number {
  if (typeof totalAvailable === "number" && Number.isFinite(totalAvailable)) {
    return totalAvailable;
  }

  return Math.max(0, freeRemaining + credits);
}

function parseFutureDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function useSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const paymentGatewayEnabled = false;

  // Fetch agreement quota (2 free, then pay per agreement)
  const { data: quota, isLoading, refetch } = useQuery({
    queryKey: ["agreement-quota", user?.id],
    queryFn: async (): Promise<AgreementQuota | null> => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .rpc("can_create_agreement_free", { p_user_id: user.id });

      if (error) {
        console.error("Error fetching agreement quota:", error);
        return null;
      }

      // Parse the JSONB response - cast to unknown first then to our type
      if (data && typeof data === 'object') {
        const result = data as unknown as {
          can_create_free: boolean;
          free_used: number;
          free_limit: number;
          free_remaining: number;
          credits: number;
          total_available: number;
          fee_amount: number;
          fee_currency: string;
        };
      return {
        can_create_free: result.can_create_free,
          free_used: result.free_used,
          free_limit: result.free_limit,
          free_remaining: result.free_remaining,
          credits: result.credits ?? 0,
          total_available: getTotalAvailable(result.free_remaining, result.credits ?? 0, result.total_available),
          fee_amount: getDefaultFeeAmount(result.fee_amount),
          fee_currency: result.fee_currency,
        };
      }

      // Default values
      return {
        can_create_free: false,
        free_used: 0,
        free_limit: 2,
        free_remaining: 0,
        credits: 0,
        total_available: 0,
        fee_amount: 29,
        fee_currency: 'THB',
      };
    },
    enabled: !!user?.id,
    staleTime: 30000, // 30 seconds
  });

  // Fetch subscription details for trial info (backwards compatibility)
  const { data: subscriptionInfo } = useQuery({
    queryKey: ["subscription-info", user?.id],
    queryFn: async (): Promise<SubscriptionInfo | null> => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from("subscriptions")
        .select("is_trial, trial_ends_at, expires_at")
        .eq("user_id", user.id)
        .single();

      if (error) {
        // May not have subscription record in new model
        console.log("No subscription record found (this is normal for pay-per-agreement model)");
        return null;
      }

      return data;
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  // Use free agreement slot
  const useFreeSlotMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc("use_free_agreement_slot", {
        p_user_id: user.id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (success) => {
      if (success) {
        queryClient.invalidateQueries({ queryKey: ["agreement-quota"] });
      }
    },
    onError: (error) => {
      console.error("Error using free slot:", error);
    },
  });

  // Use one purchased agreement credit
  const useAgreementCreditMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc("use_agreement_credit", {
        p_user_id: user.id,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (success) => {
      if (success) {
        queryClient.invalidateQueries({ queryKey: ["agreement-quota"] });
      }
    },
    onError: (error) => {
      console.error("Error using agreement credit:", error);
    },
  });

  // Record agreement payment
  const recordPaymentMutation = useMutation({
    mutationFn: async (params: { agreementId: string; amount: number; currency?: string }) => {
      if (!paymentGatewayEnabled) {
        throw new Error("Payment gateway is not enabled");
      }

      if (!user?.id) throw new Error("Not authenticated");

      const { data, error } = await supabase.rpc("record_agreement_payment", {
        p_user_id: user.id,
        p_agreement_id: params.agreementId,
        p_amount: params.amount,
        p_currency: params.currency || 'THB',
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("บันทึกการชำระเงินสำเร็จ");
      queryClient.invalidateQueries({ queryKey: ["agreement-quota"] });
    },
    onError: (error) => {
      console.error("Error recording payment:", error);
      toast.error("ไม่สามารถบันทึกการชำระเงินได้");
    },
  });

  // Check if can create free agreement
  const canCreateFree = quota?.can_create_free ?? false;
  const freeRemaining = quota?.free_remaining ?? 0;
  const feeAmount = getDefaultFeeAmount(quota?.fee_amount);
  const feeCurrency = quota?.fee_currency ?? 'THB';

  // Backwards compatibility
  const isPremium = false; // No longer using premium tier
  const trialEndsAt = parseFutureDate(subscriptionInfo?.trial_ends_at);
  const isTrial = Boolean(subscriptionInfo?.is_trial && trialEndsAt && trialEndsAt.getTime() > Date.now());
  
  const trialDaysRemaining = trialEndsAt 
    ? Math.max(0, Math.floor((trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const hasUsedTrial = Boolean(
    subscriptionInfo?.is_trial || subscriptionInfo?.trial_ends_at,
  );

  return {
    // New pay-per-agreement model
    quota,
    canCreateFree,
    freeRemaining,
    feeAmount,
    feeCurrency,
    useFreeSlot: useFreeSlotMutation.mutateAsync,
    useAgreementCredit: useAgreementCreditMutation.mutateAsync,
    recordPayment: recordPaymentMutation.mutateAsync,
    
    // Legacy compatibility
    limits: quota ? {
      tier: 'free' as const,
      agreements_used: quota.free_used,
      agreements_limit: quota.free_limit,
      groups_used: 0,
      groups_limit: -1, // Unlimited groups
      can_create_agreement: canCreateFree,
      can_create_group: true,
    } : null,
    isLoading,
    isPremium,
    isTrial,
    trialEndsAt,
    trialDaysRemaining,
    hasUsedTrial,
    canCreateAgreement: canCreateFree,
    canCreateGroup: true, // Groups are free
    agreementsRemaining: freeRemaining,
    groupsRemaining: Infinity,
    refetch,
    startTrial: () => {}, // Deprecated
    isStartingTrial: false,
  };
}
