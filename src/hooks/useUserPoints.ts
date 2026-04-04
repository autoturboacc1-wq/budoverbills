import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

type RpcClient = {
  rpc<TData>(functionName: string, args?: Record<string, unknown>): Promise<{
    data: TData | null;
    error: { message: string } | null;
  }>;
};

const rpcClient = supabase as unknown as RpcClient;

// Point values
const POINT_VALUES = {
  read_article: 5,
  save_article: 3,
  on_time_payment: 50,
  quality_comment: 10,
} as const;

const DAILY_LIMIT = 50;
const MIN_READ_TIME_SECONDS = 30;
const MIN_COMMENT_LENGTH = 20;
const BANGKOK_TIME_ZONE = "Asia/Bangkok";

function getBangkokDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export interface UserPoints {
  total_points: number;
  lifetime_points: number;
  daily_earned_today: number;
}

interface UserPointsRow extends UserPoints {
  last_daily_reset: string | null;
}

export interface PointTransaction {
  id: string;
  points: number;
  action_type: string;
  description: string | null;
  created_at: string;
}

export interface EngagementBadge {
  badge_type: string;
  badge_tier: number;
  earned_at: string;
}

export const ENGAGEMENT_BADGES = {
  on_time_payer: { label: "ชำระตรงเวลา", icon: "⏰", thresholds: [3, 10, 25] },
};

const ON_TIME_PAYMENT_BADGE_TYPE = "on_time_payer";
const ON_TIME_PAYMENT_ACTION_TYPE = "on_time_payment";

export function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function deriveEngagementBadges(transactions: PointTransaction[]): EngagementBadge[] {
  const rule = ENGAGEMENT_BADGES[ON_TIME_PAYMENT_BADGE_TYPE];
  const matchingTransactions = transactions
    .filter((transaction) => transaction.action_type === ON_TIME_PAYMENT_ACTION_TYPE)
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const tier = rule.thresholds.reduce((currentTier, threshold, index) => {
    return matchingTransactions.length >= threshold ? index + 1 : currentTier;
  }, 0);

  if (tier === 0) {
    return [];
  }

  const earnedAtIndex = rule.thresholds[tier - 1] - 1;
  const earnedAt = matchingTransactions[earnedAtIndex]?.created_at ?? matchingTransactions[matchingTransactions.length - 1]?.created_at ?? new Date().toISOString();

  return [
    {
      badge_type: ON_TIME_PAYMENT_BADGE_TYPE,
      badge_tier: tier,
      earned_at: earnedAt,
    },
  ];
}

export function useUserPoints() {
  const { user } = useAuth();
  const [points, setPoints] = useState<UserPoints | null>(null);
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [badges, setBadges] = useState<EngagementBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const earnLockRef = useRef(false);
  const redeemLockRef = useRef(false);

  const fetchPoints = useCallback(async () => {
    if (!user) {
      setPoints(null);
      setLoading(false);
      return;
    }

    try {
      const todayKey = getBangkokDateKey();

      // Fetch or create user points
      let data: UserPointsRow | null = null;
      const { data: existingData, error } = await supabase
        .from("user_points")
        .select("*")
        .eq("user_id", user.id)
        .single();

      data = existingData as UserPointsRow | null;

      if (error && error.code === "PGRST116") {
        // No record found, create one
        const { data: newData, error: insertError } = await supabase
          .from("user_points")
          .insert({
            user_id: user.id,
            last_daily_reset: todayKey,
            total_points: 0,
            lifetime_points: 0,
            daily_earned_today: 0,
          })
          .select()
          .single();

        if (insertError) throw insertError;
        data = newData;
      } else if (error) {
        throw error;
      }

      // Reset daily points if new day
      if (data && data.last_daily_reset !== todayKey) {
        const { data: updatedData } = await supabase
          .from("user_points")
          .update({ 
            daily_earned_today: 0, 
            last_daily_reset: todayKey
          })
          .eq("user_id", user.id)
          .select()
          .single();

        if (updatedData) data = updatedData;
        else data = { ...data, daily_earned_today: 0, last_daily_reset: todayKey };
      }

      setPoints(data);
    } catch (error) {
      console.error("Error fetching points:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const fetchTransactions = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase
      .from("point_transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    const nextTransactions = data || [];
    setTransactions(nextTransactions);
    setBadges(deriveEngagementBadges(nextTransactions));
  }, [user]);

  useEffect(() => {
    void fetchPoints();
    void fetchTransactions();
  }, [fetchPoints, fetchTransactions]);

  const canEarnToday = useCallback(() => {
    if (!points) return false;
    return points.daily_earned_today < DAILY_LIMIT;
  }, [points]);

  const earnPoints = useCallback(async (
    actionType: keyof typeof POINT_VALUES,
    referenceId?: string,
    description?: string
  ) => {
    if (!user) return false;
    if (earnLockRef.current) return false;

    earnLockRef.current = true;

    try {
      const referenceIdToUse = referenceId?.trim();

      if (!referenceIdToUse || !isUuidLike(referenceIdToUse)) {
        console.warn("earnPoints requires a stable UUID referenceId");
        return false;
      }

      const { data, error } = await rpcClient.rpc<{
        success?: boolean;
        duplicate?: boolean;
        points_earned?: number;
      }>("earn_points", {
        p_user_id: user.id,
        p_action_type: actionType,
        p_reference_id: referenceIdToUse,
        p_points: POINT_VALUES[actionType],
        p_description: description || null,
      });

      if (error) throw error;

      const result = data as {
        success?: boolean;
        duplicate?: boolean;
        points_earned?: number;
      } | null;

      if (!result?.success || (result.points_earned ?? 0) <= 0) {
        return false;
      }

      await fetchTransactions();
      await fetchPoints();

      toast.success(`+${result.points_earned} คะแนน!`, {
        description: description || `จากการ${getActionLabel(actionType)}`,
      });

      return true;
    } catch (error) {
      console.error("Error earning points:", error);
      return false;
    } finally {
      earnLockRef.current = false;
    }
  }, [user, fetchPoints, fetchTransactions]);

  const redeemPoints = useCallback(async (
    pointsToSpend: number,
    rewardType: string,
    rewardValue: string
  ) => {
    if (!user) return false;
    if (redeemLockRef.current) return false;
    redeemLockRef.current = true;

    try {
      const { data, error } = await rpcClient.rpc<{
        success?: boolean;
        duplicate?: boolean;
        points_spent?: number;
      }>("redeem_points", {
        p_user_id: user.id,
        p_points: pointsToSpend,
        p_reward_type: rewardType,
        p_reward_value: rewardValue,
        p_description: `แลก ${rewardType}: ${rewardValue}`,
        p_reference_id: crypto.randomUUID(),
      });

      if (error) throw error;

      const result = data as {
        success?: boolean;
        duplicate?: boolean;
        points_spent?: number;
      } | null;

      if (!result?.success) {
        return false;
      }

      await fetchTransactions();
      await fetchPoints();
      toast.success("แลกรางวัลสำเร็จ! 🎁");
      return true;
    } catch (error) {
      console.error("Error redeeming points:", error);
      toast.error("เกิดข้อผิดพลาด");
      return false;
    } finally {
      redeemLockRef.current = false;
    }
  }, [user, fetchPoints, fetchTransactions]);

  return {
    points,
    transactions,
    badges,
    loading,
    earnPoints,
    redeemPoints,
    canEarnToday,
    POINT_VALUES,
    DAILY_LIMIT,
    MIN_READ_TIME_SECONDS,
    MIN_COMMENT_LENGTH,
    refetch: fetchPoints,
  };
}

function getActionLabel(actionType: string): string {
  const labels: Record<string, string> = {
    read_article: "อ่านบทความ",
    save_article: "บันทึกบทความ",
    on_time_payment: "ชำระตรงเวลา",
    quality_comment: "แสดงความคิดเห็น",
  };
  return labels[actionType] || actionType;
}
