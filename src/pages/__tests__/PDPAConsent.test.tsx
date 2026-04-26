import React from "react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushReact, renderReact } from "@/test/reactHarness";

const pageMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  markPdpaAccepted: vi.fn(),
  from: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  profile: { pdpa_accepted_at: null as string | null },
}));

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag) => tag,
    },
  ),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => pageMocks.navigate,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    profile: pageMocks.profile,
    markPdpaAccepted: pageMocks.markPdpaAccepted,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: pageMocks.toastSuccess,
    error: pageMocks.toastError,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: pageMocks.from,
  },
}));

import PDPAConsent from "@/pages/PDPAConsent";

describe("PDPAConsent", () => {
  beforeEach(() => {
    pageMocks.navigate.mockReset();
    pageMocks.markPdpaAccepted.mockReset();
    pageMocks.from.mockReset();
    pageMocks.toastSuccess.mockReset();
    pageMocks.toastError.mockReset();
    pageMocks.profile = { pdpa_accepted_at: null };
    window.sessionStorage.clear();
  });

  it("renders the confirmation button for users who have not accepted PDPA", async () => {
    const { container, unmount } = await renderReact(<PDPAConsent />);

    const confirmButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("ยืนยันและเริ่มใช้งาน"),
    );

    expect(confirmButton).toBeInTheDocument();
    expect(confirmButton).toBeDisabled();

    await unmount();
  });

  it("marks PDPA accepted and redirects to the dashboard after confirmation", async () => {
    const profileQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    pageMocks.from.mockReturnValue(profileQuery);

    const { container, unmount } = await renderReact(<PDPAConsent />);

    await act(async () => {
      container.querySelector("#pdpa-consent")?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });

    const confirmButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("ยืนยันและเริ่มใช้งาน")
    );

    expect(confirmButton).toBeDefined();
    expect(confirmButton).not.toBeDisabled();

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await flushReact();

    const acceptedAt = profileQuery.update.mock.calls[0]?.[0]?.pdpa_accepted_at;
    expect(pageMocks.from).toHaveBeenCalledWith("profiles");
    expect(profileQuery.update).toHaveBeenCalledWith({ pdpa_accepted_at: acceptedAt });
    expect(profileQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(pageMocks.markPdpaAccepted).toHaveBeenCalledWith(acceptedAt);
    expect(pageMocks.toastSuccess).toHaveBeenCalledWith("ยอมรับข้อกำหนดเรียบร้อยแล้ว");
    expect(pageMocks.navigate).toHaveBeenCalledWith("/", { replace: true });

    await unmount();
  });

  it("continues redirecting to the dashboard if returning from the accept flow", async () => {
    window.sessionStorage.setItem("budoverbills:pdpa-dashboard-redirect", "true");
    pageMocks.profile = { pdpa_accepted_at: "2026-04-26T05:30:00.000Z" };

    const { unmount } = await renderReact(<PDPAConsent />);
    await flushReact();

    expect(pageMocks.navigate).toHaveBeenCalledWith("/", { replace: true });
    expect(window.sessionStorage.getItem("budoverbills:pdpa-dashboard-redirect")).toBeNull();

    await unmount();
  });
});
