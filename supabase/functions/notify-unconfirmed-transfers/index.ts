import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { constantTimeEquals } from "../_shared/validation.ts";

const NOTIFICATION_TYPE = "transfer_unconfirmed_reminder";
const MAX_AGREEMENTS_PER_RUN = 200;
const INTERNAL_SECRET_HEADER = "x-internal-secret";
const REMINDER_DELAY_HOURS = 24;

function getInternalSecret(req: Request): string | null {
  const headerSecret = req.headers.get(INTERNAL_SECRET_HEADER);
  return headerSecret || null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    if (!internalSecret) {
      return new Response(
        JSON.stringify({ error: "Internal function secret is not configured" }),
        {
          headers: { "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    const requestSecret = getInternalSecret(req);
    if (!requestSecret || !constantTimeEquals(requestSecret, internalSecret)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const cutoffAt = new Date(Date.now() - REMINDER_DELAY_HOURS * 60 * 60 * 1000).toISOString();

    const { data: unconfirmedAgreements, error: fetchError } = await supabase
      .from("debt_agreements")
      .select("id, lender_id, borrower_id, principal_amount, transferred_at")
      .not("transfer_slip_url", "is", null)
      .eq("borrower_confirmed_transfer", false)
      .lt("transferred_at", cutoffAt)
      .in("status", ["pending_confirmation", "active"])
      .order("transferred_at", { ascending: true })
      .limit(MAX_AGREEMENTS_PER_RUN);

    if (fetchError) {
      console.error("Error fetching unconfirmed agreements:", fetchError);
      throw fetchError;
    }

    console.log(`Found ${unconfirmedAgreements?.length || 0} unconfirmed transfers`);

    let notificationsSent = 0;

    for (const agreement of unconfirmedAgreements || []) {
      const amount = Number(agreement.principal_amount).toLocaleString("th-TH");

      const recipients: Array<{ userId: string; title: string; message: string }> = [];

      if (agreement.borrower_id) {
        recipients.push({
          userId: agreement.borrower_id,
          title: "⏰ รอยืนยันรับเงิน",
          message: `กรุณายืนยันการรับเงิน ฿${amount} - ผู้ให้ยืมอัปโหลดสลิปแล้ว`,
        });
      }

      recipients.push({
        userId: agreement.lender_id,
        title: "⏰ ยังไม่ได้รับการยืนยัน",
        message: `ผู้ยืม ฿${amount} ยังไม่ได้ยืนยันรับเงิน - ผ่านไปแล้ว ${REMINDER_DELAY_HOURS} ชั่วโมง`,
      });

      for (const recipient of recipients) {
        const { data: existingNotification, error: dedupeError } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", recipient.userId)
          .eq("type", NOTIFICATION_TYPE)
          .eq("related_id", agreement.id)
          .eq("related_type", "debt_agreement")
          .limit(1);

        if (dedupeError) {
          console.error("Error checking notification dedupe", {
            agreementId: agreement.id,
            userId: recipient.userId,
            error: dedupeError,
          });
          continue;
        }

        if ((existingNotification?.length ?? 0) > 0) {
          console.log("Skipping duplicate reminder", {
            agreementId: agreement.id,
            userId: recipient.userId,
          });
          continue;
        }

        const { error: insertError } = await supabase.from("notifications").insert({
          user_id: recipient.userId,
          type: NOTIFICATION_TYPE,
          title: recipient.title,
          message: recipient.message,
          related_id: agreement.id,
          related_type: "debt_agreement",
        });

        if (insertError) {
          console.error("Error creating notification", {
            agreementId: agreement.id,
            userId: recipient.userId,
            error: insertError,
          });
          continue;
        }

        notificationsSent += 1;
      }
    }

    console.log("Sent notifications", {
      checked: unconfirmedAgreements?.length || 0,
      notificationsSent,
    });

    return new Response(
      JSON.stringify({
        success: true,
        checked: unconfirmedAgreements?.length || 0,
        notificationsSent,
      }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in notify-unconfirmed-transfers:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
