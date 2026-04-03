import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const NOTIFICATION_TYPE = "transfer_unconfirmed_reminder";
const NOTIFICATION_WINDOW_HOURS = 24;
const MAX_AGREEMENTS_PER_RUN = 200;

function getInternalSecret(req: Request): string | null {
  const headerSecret = req.headers.get("x-internal-secret");
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    if (!internalSecret) {
      return new Response(
        JSON.stringify({ error: "Internal function secret is not configured" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        }
      );
    }

    const requestSecret = getInternalSecret(req);
    if (!requestSecret || !constantTimeEquals(requestSecret, internalSecret)) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const cutoffAt = new Date(Date.now() - NOTIFICATION_WINDOW_HOURS * 60 * 60 * 1000).toISOString();

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
        message: `ผู้ยืม ฿${amount} ยังไม่ได้ยืนยันรับเงิน - ผ่านไปแล้ว ${NOTIFICATION_WINDOW_HOURS} ชั่วโมง`,
      });

      for (const recipient of recipients) {
        const { data: existingNotification, error: dedupeError } = await supabase
          .from("notifications")
          .select("id")
          .eq("user_id", recipient.userId)
          .eq("related_id", agreement.id)
          .eq("related_type", "debt_agreement")
          .eq("type", NOTIFICATION_TYPE)
          .gte("created_at", cutoffAt)
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
      cutoffAt,
    });

    return new Response(
      JSON.stringify({
        success: true,
        checked: unconfirmedAgreements?.length || 0,
        notificationsSent,
        cutoffAt,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in notify-unconfirmed-transfers:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
