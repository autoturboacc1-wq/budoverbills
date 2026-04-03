import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "null",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const REMINDER_OFFSETS = [0, 1, 3] as const;
const REMINDER_TYPE = "payment_reminder";
const INTERNAL_SECRET_HEADER = "x-internal-secret";
const BANGKOK_TIME_ZONE = "Asia/Bangkok";

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

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error(`Unable to format date in ${timeZone}`);
  }

  return `${year}-${month}-${day}`;
}

function addDaysInTimeZone(date: Date, days: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);

  if (!year || !month || !day) {
    throw new Error(`Unable to calculate date in ${timeZone}`);
  }

  const next = new Date(Date.UTC(year, month - 1, day + days));
  return formatDateInTimeZone(next, timeZone);
}

function startOfDayInTimeZone(date: Date, timeZone: string): string {
  const dateString = formatDateInTimeZone(date, timeZone);
  return new Date(`${dateString}T00:00:00+07:00`).toISOString();
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

function constantTimeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return mismatch === 0;
}

function getInternalSecret(req: Request): string | null {
  const headerSecret = req.headers.get(INTERNAL_SECRET_HEADER);
  if (headerSecret) {
    return headerSecret;
  }

  const authorization = req.headers.get("authorization");
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
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
    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    if (!internalSecret) {
      throw new Error("Missing INTERNAL_FUNCTION_SECRET");
    }

    const requestSecret = getInternalSecret(req);
    if (!requestSecret || !constantTimeEquals(requestSecret, internalSecret)) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const today = formatDateInTimeZone(now, BANGKOK_TIME_ZONE);
    const inOneDay = addDaysInTimeZone(now, 1, BANGKOK_TIME_ZONE);
    const inThreeDays = addDaysInTimeZone(now, 3, BANGKOK_TIME_ZONE);
    const todayStart = startOfDayInTimeZone(now, BANGKOK_TIME_ZONE);

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
      const reminderKey = `${installment.id}:${reminderOffset}`;

      const { data: existingReminder, error: dedupeError } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", borrowerId)
        .eq("type", REMINDER_TYPE)
        .eq("related_id", reminderKey)
        .eq("related_type", "installment")
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
        related_id: reminderKey,
        related_type: "installment",
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
