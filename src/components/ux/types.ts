export type ActionPriority = "primary" | "warning" | "danger" | "neutral";

export type FinancialStatus =
  | "pending"
  | "due_soon"
  | "overdue"
  | "verifying"
  | "paid"
  | "rejected";

export type UserIntent = "lend" | "borrow";
