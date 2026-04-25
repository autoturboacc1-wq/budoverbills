import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { featureFlags } from "@/config/featureFlags";

export interface AgreementQuota {
  can_create_free: boolean;
  free_used: number;
  free_limit: number;
  free_remaining: number;
  credits: number;
  total_available: number;
  fee_amount: number;
  fee_currency: string;
}

export interface SubscriptionInfo {
  is_trial: boolean;
  trial_ends_at: string | null;
  expires_at: string | null;
}

export interface SubscriptionStateCache {
  quota: AgreementQuota | null;
  subscriptionInfo: SubscriptionInfo | null;
}

const SUBSCRIPTION_STATE_CACHE_PREFIX = "subscription-state";

function getDefaultFeeAmount(feeAmount?: number | null): number {
  return typeof feeAmount === "number" && Number.isFinite(feeAmount) ? feeAmount : 29;
}

function getTotalAvailable(freeRemaining: number, credits: number, totalAvailable?: number | null): number {
  if (typeof totalAvailable === "number" && Number.isFinite(totalAvailable)) {
    return totalAvailable;
  }

  return Math.max(0, freeRemaining + credits);
}

function getSubscriptionStateCacheKey(userId: string): string {
  return `${SUBSCRIPTION_STATE_CACHE_PREFIX}:${userId}`;
}

export function readCachedSubscriptionState(userId: string): SubscriptionStateCache | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getSubscriptionStateCacheKey(userId));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<SubscriptionStateCache>;
    return {
      quota: parsed.quota ?? null,
      subscriptionInfo: parsed.subscriptionInfo ?? null,
    };
  } catch {
    return null;
  }
}

export function writeCachedSubscriptionState(userId: string, state: SubscriptionStateCache): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(getSubscriptionStateCacheKey(userId), JSON.stringify(state));
  } catch {
    // Ignore cache persistence failures and continue with live data.
  }
}

function updateCachedSubscriptionState(userId: string, patch: Partial<SubscriptionStateCache>): void {
  const current = readCachedSubscriptionState(userId) ?? {
    quota: null,
    subscriptionInfo: null,
  };

  writeCachedSubscriptionState(userId, {
    quota: patch.quota ?? current.quota,
    subscriptionInfo: patch.subscriptionInfo ?? current.subscriptionInfo,
  });
}

export function getTrialDaysRemaining(trialEndsAt: Date | null, now = Date.now()): number {
  if (!trialEndsAt) {
    return 0;
  }

  return Math.max(0, Math.ceil((trialEndsAt.getTime() - now) / (1000 * 60 * 60 * 24)));
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
  const paymentGatewayEnabled = featureFlags.paymentGatewayEnabled;
  const cachedSubscriptionState = user?.id ? readCachedSubscriptionState(user.id) : null;

  // Fetch agreement quota (2 free, then pay per agreement)
  const { data: quota, isLoading, refetch } = useQuery({
    queryKey: ["agreement-quota", user?.id],
    placeholderData: cachedSubscriptionState?.quota ?? undefined,
    queryFn: async (): Promise<AgreementQuota | null> => {
      if (!user?.id) return null;

      const cachedQuota = readCachedSubscriptionState(user.id)?.quota ?? null;
      const { data, error } = await supabase
        .rpc("can_create_agreement_free", { p_user_id: user.id });

      if (error) {
        console.error("Error fetching agreement quota:", error);
        return cachedQuota;
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
        const nextQuota: AgreementQuota = {
          can_create_free: result.can_create_free,
          free_used: result.free_used,
          free_limit: result.free_limit,
          free_remaining: result.free_remaining,
          credits: result.credits ?? 0,
          total_available: getTotalAvailable(result.free_remaining, result.credits ?? 0, result.total_available),
          fee_amount: getDefaultFeeAmount(result.fee_amount),
          fee_currency: result.fee_currency,
        };

        updateCachedSubscriptionState(user.id, { quota: nextQuota });
        return nextQuota;
      }

      return cachedQuota;
    },
    enabled: !!user?.id,
    staleTime: 30000, // 30 seconds
  });

  // Fetch subscription details for trial info (backwards compatibility)
  const { data: subscriptionInfo } = useQuery({
    queryKey: ["subscription-info", user?.id],
    placeholderData: cachedSubscriptionState?.subscriptionInfo ?? undefined,
    queryFn: async (): Promise<SubscriptionInfo | null> => {
      if (!user?.id) return null;

      const cachedInfo = readCachedSubscriptionState(user.id)?.subscriptionInfo ?? null;
      const { data, error } = await supabase
        .from("subscriptions")
        .select("is_trial, trial_ends_at, expires_at")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching subscription info:", error);
        return cachedInfo;
      }

      updateCachedSubscriptionState(user.id, { subscriptionInfo: data });
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
  
  const trialDaysRemaining = getTrialDaysRemaining(trialEndsAt);

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
