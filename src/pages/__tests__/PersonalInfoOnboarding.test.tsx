import React from "react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushReact, renderReact } from "@/test/reactHarness";

const pageMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  refreshProfile: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get: (_target, tag) => tag,
    }
  ),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => pageMocks.navigate,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    refreshProfile: pageMocks.refreshProfile,
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
    rpc: pageMocks.rpc,
  },
}));

import PersonalInfoOnboarding from "@/pages/PersonalInfoOnboarding";

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function submitPersonalInfo(container: HTMLElement, values: { firstName: string; lastName: string; phone: string }) {
  await act(async () => {
    setInputValue(container.querySelector("#firstName") as HTMLInputElement, values.firstName);
    setInputValue(container.querySelector("#lastName") as HTMLInputElement, values.lastName);
    setInputValue(container.querySelector("#phone") as HTMLInputElement, values.phone);
  });

  const submitButton = Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("ดำเนินการต่อ")
  );

  await act(async () => {
    submitButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });

  await flushReact();
}

describe("PersonalInfoOnboarding", () => {
  beforeEach(() => {
    pageMocks.navigate.mockReset();
    pageMocks.refreshProfile.mockReset();
    pageMocks.from.mockReset();
    pageMocks.rpc.mockReset();
    pageMocks.toastSuccess.mockReset();
    pageMocks.toastError.mockReset();
  });

  it("does not submit whitespace-only names after trimming", async () => {
    const { container, unmount } = await renderReact(<PersonalInfoOnboarding />);

    await submitPersonalInfo(container, {
      firstName: "   ",
      lastName: "Somchai",
      phone: "0812345678",
    });

    expect(pageMocks.from).not.toHaveBeenCalled();
    expect(pageMocks.navigate).not.toHaveBeenCalled();
    expect(container.textContent).toContain("กรุณากรอกชื่อ");

    await unmount();
  });

  it("creates a missing profile before continuing to PDPA consent", async () => {
    const profileQuery = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
    };

    pageMocks.from.mockReturnValue(profileQuery);
    pageMocks.rpc.mockResolvedValue({ data: "ABC12345", error: null });
    pageMocks.refreshProfile.mockResolvedValue(undefined);

    const { container, unmount } = await renderReact(<PersonalInfoOnboarding />);

    await submitPersonalInfo(container, {
      firstName: "  Niran ",
      lastName: " Somchai  ",
      phone: "0812345678",
    });

    expect(profileQuery.update).toHaveBeenCalledWith({
      first_name: "Niran",
      last_name: "Somchai",
      phone: "0812345678",
      display_name: "Niran Somchai",
    });
    expect(pageMocks.rpc).toHaveBeenCalledWith("generate_user_code");
    expect(profileQuery.insert).toHaveBeenCalledWith({
      user_id: "user-1",
      user_code: "ABC12345",
      first_name: "Niran",
      last_name: "Somchai",
      phone: "0812345678",
      display_name: "Niran Somchai",
    });
    expect(pageMocks.refreshProfile).toHaveBeenCalled();
    expect(pageMocks.navigate).toHaveBeenCalledWith("/pdpa-consent", { replace: true });

    await unmount();
  });
});
