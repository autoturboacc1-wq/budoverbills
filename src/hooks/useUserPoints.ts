import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

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

export function useUserPoints() {
  const { user } = useAuth();
  const [points, setPoints] = useState<UserPoints | null>(null);
  const [transactions, setTransactions] = useState<PointTransaction[]>([]);
  const [badges, setBadges] = useState<EngagementBadge[]>([]);
  const [loading, setLoading] = useState(true);

  const checkBadgeProgress = useCallback(async (actionType: keyof typeof POINT_VALUES) => {
    if (!user) return;

    const badgeTypeMap: Record<string, string> = {
      read_article: "avid_reader",
      save_article: "collector",
      on_time_payment: "on_time_payer",
      quality_comment: "contributor",
    };

    const badgeType = badgeTypeMap[actionType];
    if (!badgeType) return;

    // Count actions of this type
    const { count } = await supabase
      .from("point_transactions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("action_type", actionType);

    if (!count) return;

    const thresholds = ENGAGEMENT_BADGES[badgeType as keyof typeof ENGAGEMENT_BADGES]?.thresholds || [];
    let newTier = 0;
    for (let i = 0; i < thresholds.length; i++) {
      if (count >= thresholds[i]) {
        newTier = i + 1;
      }
    }

    if (newTier === 0) return;

    // Check current badge tier
    const existingBadge = badges.find(b => b.badge_type === badgeType);
    if (existingBadge && existingBadge.badge_tier >= newTier) return;

    // Upsert badge
    const { data: newBadge } = await supabase
      .from("engagement_badges")
      .upsert({
        user_id: user.id,
        badge_type: badgeType,
        badge_tier: newTier,
      }, { onConflict: "user_id,badge_type" })
      .select()
      .single();

    if (newBadge) {
      setBadges(prev => {
        const filtered = prev.filter(b => b.badge_type !== badgeType);
        return [...filtered, newBadge];
      });

      const badgeInfo = ENGAGEMENT_BADGES[badgeType as keyof typeof ENGAGEMENT_BADGES];
      const tierName = ["", "🥉 Bronze", "🥈 Silver", "🥇 Gold"][newTier];
      toast.success(`🎉 ได้รับ Badge ใหม่!`, {
        description: `${badgeInfo.icon} ${badgeInfo.label} ${tierName}`,
      });
    }
  }, [user, badges]);

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

    if (data) setTransactions(data);
  }, [user]);

  const fetchBadges = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase
      .from("engagement_badges")
      .select("*")
      .eq("user_id", user.id);

    if (data) setBadges(data);
  }, [user]);

  useEffect(() => {
    fetchPoints();
    fetchTransactions();
    fetchBadges();
  }, [fetchPoints, fetchTransactions, fetchBadges]);

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

    const { data: latestPoints, error: pointsError } = await supabase
      .from("user_points")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (pointsError) {
      console.error("Error refreshing points before earning:", pointsError);
      return false;
    }

    const currentPoints = latestPoints as UserPointsRow;

    // Check daily limit against the latest server snapshot
    if (currentPoints.daily_earned_today >= DAILY_LIMIT) {
      return false;
    }

    const pointsToEarn = Math.min(
      POINT_VALUES[actionType],
      DAILY_LIMIT - currentPoints.daily_earned_today
    );

    if (pointsToEarn <= 0) return false;

    try {
      // Check if already earned for this reference (prevent duplicates)
      if (referenceId) {
        const { data: existing } = await supabase
          .from("point_transactions")
          .select("id")
          .eq("user_id", user.id)
          .eq("action_type", actionType)
          .eq("reference_id", referenceId)
          .maybeSingle();

        if (existing) return false; // Already earned
      }

      const nextPoints = {
        total_points: currentPoints.total_points + pointsToEarn,
        lifetime_points: currentPoints.lifetime_points + pointsToEarn,
        daily_earned_today: currentPoints.daily_earned_today + pointsToEarn,
      };

      // Update points first so the counter remains consistent with any later transaction write.
      const { data: updatedPoints, error: updateError } = await supabase
        .from("user_points")
        .update(nextPoints)
        .eq("user_id", user.id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Insert transaction
      const { error: transactionError } = await supabase
        .from("point_transactions")
        .insert({
          user_id: user.id,
          points: pointsToEarn,
          action_type: actionType,
          reference_id: referenceId || null,
          description: description || null,
        });

      if (transactionError) {
        await supabase
          .from("user_points")
          .update(currentPoints)
          .eq("user_id", user.id);
        setPoints(currentPoints);
        throw transactionError;
      }

      if (updatedPoints) {
        setPoints(updatedPoints);
      }

      await fetchTransactions();
      await fetchPoints();

      toast.success(`+${pointsToEarn} คะแนน!`, {
        description: description || `จากการ${getActionLabel(actionType)}`,
      });

      // Check for badge upgrades
      await checkBadgeProgress(actionType);

      return true;
    } catch (error) {
      console.error("Error earning points:", error);
      return false;
    }
  }, [user, checkBadgeProgress, fetchPoints, fetchTransactions]);

  const redeemPoints = useCallback(async (
    pointsToSpend: number,
    rewardType: string,
    rewardValue: string
  ) => {
    if (!user) return false;

    const { data: latestPoints, error: pointsError } = await supabase
      .from("user_points")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (pointsError) {
      console.error("Error refreshing points before redeeming:", pointsError);
      toast.error("เกิดข้อผิดพลาด");
      return false;
    }

    const currentPoints = latestPoints as UserPointsRow;

    if (currentPoints.total_points < pointsToSpend) {
      toast.error("คะแนนไม่เพียงพอ");
      return false;
    }

    try {
      const nextPoints = {
        total_points: currentPoints.total_points - pointsToSpend,
        lifetime_points: currentPoints.lifetime_points,
        daily_earned_today: currentPoints.daily_earned_today,
      };

      const { data: updatedPoints, error: updateError } = await supabase
        .from("user_points")
        .update(nextPoints)
        .eq("user_id", user.id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Create redemption
      const { data: redemption, error: redemptionError } = await supabase
        .from("point_redemptions")
        .insert({
          user_id: user.id,
          points_spent: pointsToSpend,
          reward_type: rewardType,
          reward_value: rewardValue,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        })
        .select()
        .single();

      if (redemptionError) {
        await supabase
          .from("user_points")
          .update(currentPoints)
          .eq("user_id", user.id);
        setPoints(currentPoints);
        throw redemptionError;
      }

      // Log redemption transaction
      const { error: transactionError } = await supabase
        .from("point_transactions")
        .insert({
          user_id: user.id,
          points: -pointsToSpend,
          action_type: "redeem",
          description: `แลก ${rewardType}: ${rewardValue}`,
        });

      if (transactionError) {
        if (redemption?.id) {
          await supabase.from("point_redemptions").delete().eq("id", redemption.id);
        }

        await supabase
          .from("user_points")
          .update(currentPoints)
          .eq("user_id", user.id);
        setPoints(currentPoints);
        throw transactionError;
      }

      if (updatedPoints) {
        setPoints(updatedPoints);
      }

      await fetchTransactions();
      await fetchPoints();
      toast.success("แลกรางวัลสำเร็จ! 🎁");
      return true;
    } catch (error) {
      console.error("Error redeeming points:", error);
      toast.error("เกิดข้อผิดพลาด");
      return false;
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
