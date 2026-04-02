import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REMINDER_OFFSETS = [0, 1, 3] as const;
const REMINDER_TYPE = "payment_reminder";

type ReminderOffset = typeof REMINDER_OFFSETS[number];

type ReminderInstallment = {
  id: string;
  agreement_id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  debt_agreements: Array<{
    borrower_id: string | null;
    lender_id: string;
  }>;
};

function toUtcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function startOfUtcDay(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

function formatMoney(amount: number): string {
  return Number(amount).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatThaiDate(dateString: string): string {
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${dateString}T00:00:00.000Z`));
}

function getReminderOffset(dueDate: string, today: string, inOneDay: string, inThreeDays: string): ReminderOffset | null {
  if (dueDate === today) return 0;
  if (dueDate === inOneDay) return 1;
  if (dueDate === inThreeDays) return 3;
  return null;
}

function buildReminderContent(installment: ReminderInstallment, offset: ReminderOffset) {
  const title =
    offset === 0
      ? "🔔 วันนี้ครบกำหนดชำระ"
      : `⏰ ครบกำหนดชำระใน ${offset} วัน`;
  const installmentLabel = `งวดที่ ${installment.installment_number}`;
  const message = `${installmentLabel} ยอด ฿${formatMoney(installment.amount)} ครบกำหนด ${formatThaiDate(
    installment.due_date,
  )}`;

  return { title, message };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const today = toUtcDateString(now);
    const inOneDay = toUtcDateString(addUtcDays(now, 1));
    const inThreeDays = toUtcDateString(addUtcDays(now, 3));
    const todayStart = startOfUtcDay(now);

    const { data: installments, error: fetchError } = await supabase
      .from("installments")
      .select(`
        id,
        agreement_id,
        installment_number,
        amount,
        due_date,
        debt_agreements!inner (
          borrower_id,
          lender_id
        )
      `)
      .eq("status", "pending")
      .in("due_date", [today, inOneDay, inThreeDays]);

    if (fetchError) {
      throw fetchError;
    }

    let checked = 0;
    let remindersCreated = 0;
    let duplicatesSkipped = 0;
    let missingBorrowerSkipped = 0;
    let insertErrors = 0;

    for (const installment of (installments ?? []) as ReminderInstallment[]) {
      checked += 1;

      const borrowerId = installment.debt_agreements[0]?.borrower_id;
      const reminderOffset = getReminderOffset(installment.due_date, today, inOneDay, inThreeDays);

      if (!borrowerId || reminderOffset === null) {
        missingBorrowerSkipped += 1;
        continue;
      }

      const { title, message } = buildReminderContent(installment, reminderOffset);

      const { data: existingReminder, error: dedupeError } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", borrowerId)
        .eq("type", REMINDER_TYPE)
        .eq("title", title)
        .eq("message", message)
        .gte("created_at", todayStart)
        .limit(1);

      if (dedupeError) {
        console.error("[payment-reminder-cron] Failed dedupe check", {
          installmentId: installment.id,
          error: dedupeError.message,
        });
        insertErrors += 1;
        continue;
      }

      if (existingReminder && existingReminder.length > 0) {
        duplicatesSkipped += 1;
        continue;
      }

      const { error: insertError } = await supabase.from("notifications").insert({
        user_id: borrowerId,
        type: REMINDER_TYPE,
        title,
        message,
        related_id: installment.agreement_id,
        related_type: "agreement",
      });

      if (insertError) {
        console.error("[payment-reminder-cron] Failed to create notification", {
          installmentId: installment.id,
          borrowerId,
          error: insertError.message,
        });
        insertErrors += 1;
        continue;
      }

      remindersCreated += 1;
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked,
        reminders_created: remindersCreated,
        duplicates_skipped: duplicatesSkipped,
        missing_borrower_skipped: missingBorrowerSkipped,
        insert_errors: insertErrors,
        target_dates: [today, inOneDay, inThreeDays],
        timestamp: now.toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[payment-reminder-cron] Unexpected error", error);

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
