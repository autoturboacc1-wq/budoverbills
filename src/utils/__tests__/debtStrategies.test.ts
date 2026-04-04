import { describe, expect, it } from "vitest";

import {
  avalanche,
  estimateMonthlyPayment,
  frequencyNeedsMonthlyEstimate,
  snowball,
  type DebtItem,
} from "@/utils/debtStrategies";

const debts: DebtItem[] = [
  {
    id: "small-balance",
    name: "Small balance",
    balance: 1_000,
    minPayment: 100,
    interestRate: 5,
    frequency: "monthly",
  },
  {
    id: "high-interest",
    name: "High interest",
    balance: 5_000,
    minPayment: 100,
    interestRate: 20,
    frequency: "monthly",
  },
];

describe("debtStrategies", () => {
  it("converts scheduled payments to estimated monthly payments", () => {
    expect(estimateMonthlyPayment(100, "daily")).toBe(3000);
    expect(estimateMonthlyPayment(250, "weekly")).toBe(1000);
    expect(estimateMonthlyPayment(900, "monthly")).toBe(900);
  });

  it("flags non-monthly agreements as estimated", () => {
    expect(frequencyNeedsMonthlyEstimate("daily")).toBe(true);
    expect(frequencyNeedsMonthlyEstimate("weekly")).toBe(true);
    expect(frequencyNeedsMonthlyEstimate("monthly")).toBe(false);
  });

  it("makes avalanche save at least as much interest as snowball for mixed-rate debts", () => {
    const mixedRateDebts: DebtItem[] = [
      {
        id: "small-balance",
        name: "Small balance",
        balance: 1_000,
        minPayment: 150,
        interestRate: 1,
        frequency: "monthly",
      },
      {
        id: "high-interest",
        name: "High interest",
        balance: 5_000,
        minPayment: 300,
        interestRate: 2,
        frequency: "monthly",
      },
    ];

    const snowballPlan = snowball(mixedRateDebts, 400);
    const avalanchePlan = avalanche(mixedRateDebts, 400);

    expect(avalanchePlan.totalInterestPaid).toBeLessThan(snowballPlan.totalInterestPaid);
    expect(avalanchePlan.monthlySnapshots.length).toBeGreaterThan(0);
    expect(snowballPlan.payoffOrder[0]).toBe("small-balance");
    expect(new Set(avalanchePlan.payoffOrder)).toEqual(new Set(mixedRateDebts.map((debt) => debt.id)));
  });

  it("applies interest using each debt frequency instead of monthly hardcoding", () => {
    const monthlyPlan = avalanche([
      {
        id: "monthly",
        name: "Monthly debt",
        balance: 1_000,
        minPayment: 0,
        interestRate: 1,
        frequency: "monthly",
      },
    ]);

    const weeklyPlan = avalanche([
      {
        id: "weekly",
        name: "Weekly debt",
        balance: 1_000,
        minPayment: 0,
        interestRate: 1,
        frequency: "weekly",
      },
    ]);

    const dailyPlan = avalanche([
      {
        id: "daily",
        name: "Daily debt",
        balance: 1_000,
        minPayment: 0,
        interestRate: 1,
        frequency: "daily",
      },
    ]);

    expect(monthlyPlan.monthlySnapshots[0]?.totalInterestPaid).toBe(10);
    expect(weeklyPlan.monthlySnapshots[0]?.totalInterestPaid).toBeGreaterThan(40);
    expect(dailyPlan.monthlySnapshots[0]?.totalInterestPaid).toBeGreaterThan(300);
  });
});
