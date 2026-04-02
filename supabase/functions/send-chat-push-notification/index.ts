import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface WebPushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      recipientId, 
      senderName, 
      messagePreview, 
      agreementId 
    } = await req.json();

    if (!recipientId || !senderName) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get recipient's push subscriptions
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", recipientId);

    if (subError) {
      console.error("Error fetching subscriptions:", subError);
      throw subError;
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: "No push subscriptions found for user" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare push notification payload
    const payload: WebPushPayload = {
      title: `ข้อความจาก ${senderName}`,
      body: messagePreview?.substring(0, 100) || "คุณมีข้อความใหม่",
      icon: "/pwa-192x192.png",
      badge: "/favicon.png",
      data: {
        url: `/chat/${agreementId}`,
        agreementId,
      },
    };

    // Note: In production, you would use web-push library
    // For now, we'll create an in-app notification as fallback
    await supabase.from("notifications").insert({
      user_id: recipientId,
      type: "new_message",
      title: payload.title,
      message: payload.body,
      related_type: "agreement",
      related_id: agreementId,
    });

    console.log(`Created notification for user ${recipientId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Notification sent",
        subscriptionCount: subscriptions.length 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in send-chat-push-notification:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
