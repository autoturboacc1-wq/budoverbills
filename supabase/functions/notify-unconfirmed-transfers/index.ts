import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

function getInternalSecret(req: Request): string | null {
  const headerSecret = req.headers.get('x-internal-secret');
  if (headerSecret) {
    return headerSecret;
  }

  const authorization = req.headers.get('authorization');
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const internalSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    if (!internalSecret) {
      return new Response(
        JSON.stringify({ error: 'Internal function secret is not configured' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    const requestSecret = getInternalSecret(req);
    if (!requestSecret || requestSecret !== internalSecret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find agreements where:
    // 1. Lender has uploaded transfer slip (transfer_slip_url is not null)
    // 2. Borrower hasn't confirmed (borrower_confirmed_transfer = false)
    // 3. More than 24 hours have passed since transfer
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: unconfirmedAgreements, error: fetchError } = await supabase
      .from('debt_agreements')
      .select('id, lender_id, borrower_id, principal_amount, transferred_at')
      .not('transfer_slip_url', 'is', null)
      .eq('borrower_confirmed_transfer', false)
      .lt('transferred_at', twentyFourHoursAgo)
      .in('status', ['pending_confirmation', 'active']);

    if (fetchError) {
      console.error('Error fetching unconfirmed agreements:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${unconfirmedAgreements?.length || 0} unconfirmed transfers`);

    let notificationsSent = 0;

    for (const agreement of unconfirmedAgreements || []) {
      // Check if we already sent a notification for this agreement in the last 24 hours
      const { data: existingNotification } = await supabase
        .from('notifications')
        .select('id')
        .eq('related_id', agreement.id)
        .eq('type', 'transfer_unconfirmed_reminder')
        .gte('created_at', twentyFourHoursAgo)
        .limit(1);

      if (existingNotification && existingNotification.length > 0) {
        console.log(`Skipping agreement ${agreement.id} - notification already sent`);
        continue;
      }

      const amount = Number(agreement.principal_amount).toLocaleString('th-TH');

      // Notify borrower to confirm
      if (agreement.borrower_id) {
        const { error: borrowerNotifError } = await supabase
          .from('notifications')
          .insert({
            user_id: agreement.borrower_id,
            type: 'transfer_unconfirmed_reminder',
            title: '⏰ รอยืนยันรับเงิน',
            message: `กรุณายืนยันการรับเงิน ฿${amount} - ผู้ให้ยืมอัปโหลดสลิปแล้ว`,
            related_id: agreement.id,
            related_type: 'debt_agreement',
          });

        if (borrowerNotifError) {
          console.error('Error creating borrower notification:', borrowerNotifError);
        } else {
          notificationsSent++;
        }
      }

      // Notify lender that borrower hasn't confirmed
      const { error: lenderNotifError } = await supabase
        .from('notifications')
        .insert({
          user_id: agreement.lender_id,
          type: 'transfer_unconfirmed_reminder',
          title: '⏰ ยังไม่ได้รับการยืนยัน',
          message: `ผู้ยืม ฿${amount} ยังไม่ได้ยืนยันรับเงิน - ผ่านไปแล้ว 24 ชั่วโมง`,
          related_id: agreement.id,
          related_type: 'debt_agreement',
        });

      if (lenderNotifError) {
        console.error('Error creating lender notification:', lenderNotifError);
      } else {
        notificationsSent++;
      }
    }

    console.log(`Sent ${notificationsSent} notifications`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        checked: unconfirmedAgreements?.length || 0,
        notificationsSent 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in notify-unconfirmed-transfers:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
