import { describe, expect, it } from "vitest";
import { deriveEngagementBadges, isUuidLike, type PointTransaction } from "@/hooks/useUserPoints";

function makeOnTimePaymentTransactions(count: number): PointTransaction[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `tx-${index + 1}`,
    points: 50,
    action_type: "on_time_payment",
    description: null,
    created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  }));
}

describe("useUserPoints helpers", () => {
  it("requires a UUID-like reference id for point idempotency", () => {
    expect(isUuidLike("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isUuidLike("not-a-uuid")).toBe(false);
  });

  it("derives on-time payment badge tiers from transaction history", () => {
    expect(deriveEngagementBadges(makeOnTimePaymentTransactions(2))).toEqual([]);

    expect(deriveEngagementBadges(makeOnTimePaymentTransactions(10))).toEqual([
      {
        badge_type: "on_time_payer",
        badge_tier: 2,
        earned_at: "2026-01-10T00:00:00.000Z",
      },
    ]);
  });
});
