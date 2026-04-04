import { describe, expect, it } from "vitest";
import { dedupeNotificationsById, type Notification } from "@/hooks/useNotifications";

function makeNotification(id: string, title: string): Notification {
  return {
    id,
    user_id: "user-1",
    type: "payment_due",
    title,
    message: title,
    related_id: null,
    related_type: null,
    is_read: false,
    created_at: "2026-04-01T00:00:00.000Z",
    priority: "info",
    action_url: null,
  };
}

describe("useNotifications helpers", () => {
  it("deduplicates notifications by id while preserving first occurrence order", () => {
    const result = dedupeNotificationsById([
      makeNotification("n1", "first"),
      makeNotification("n2", "second"),
      makeNotification("n1", "duplicate"),
    ]);

    expect(result).toHaveLength(2);
    expect(result.map((notification) => notification.id)).toEqual(["n1", "n2"]);
    expect(result[0].title).toBe("first");
  });
});
