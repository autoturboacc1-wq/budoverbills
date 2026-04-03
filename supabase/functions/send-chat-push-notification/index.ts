import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isNonEmptyString, isValidUuid } from "../_shared/validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "null",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

interface WebPushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
}

interface ChatNotificationRequest {
  recipientId: unknown;
  senderName: unknown;
  messagePreview?: unknown;
  agreementId?: unknown;
}

interface ChatTargetContext {
  relatedId: string;
  relatedType: "agreement" | "chat";
  actionUrl: string;
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function buildChatTargetContext(agreementId: string | null, chatId: string): ChatTargetContext {
  if (agreementId) {
    return {
      relatedId: agreementId,
      relatedType: "agreement",
      actionUrl: `/chat/${agreementId}`,
    };
  }

  return {
    relatedId: chatId,
    relatedType: "chat",
    actionUrl: `/chat/${chatId}`,
  };
}

function truncateMessage(message: string | null | undefined, maxLength: number): string {
  const trimmed = (message ?? "").trim();
  if (!trimmed) {
    return "คุณมีข้อความใหม่";
  }

  return trimmed.length > maxLength ? `${trimmed.slice(0, maxLength - 1)}…` : trimmed;
}

serve(async (req) => {
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: "Missing Supabase environment variables" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const bearerToken = getBearerToken(req);

    if (!bearerToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(bearerToken);
    const callerId = userData.user?.id ?? null;

    if (userError || !callerId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null) as ChatNotificationRequest | null;

    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { recipientId, senderName, messagePreview, agreementId } = body;

    if (!isValidUuid(recipientId)) {
      return new Response(JSON.stringify({ error: "Invalid recipientId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isNonEmptyString(senderName, 255)) {
      return new Response(JSON.stringify({ error: "Invalid senderName" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (agreementId !== undefined && agreementId !== null && !isValidUuid(agreementId)) {
      return new Response(JSON.stringify({ error: "Invalid agreementId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (messagePreview !== undefined && messagePreview !== null && typeof messagePreview !== "string") {
      return new Response(JSON.stringify({ error: "Invalid messagePreview" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (recipientId === callerId) {
      return new Response(JSON.stringify({ error: "Cannot notify yourself" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const targetAgreementId = typeof agreementId === "string" ? agreementId : null;
    let targetContext: ChatTargetContext | null = null;

    if (typeof agreementId === "string") {
      const { data: agreement, error: agreementError } = await supabase
        .from("debt_agreements")
        .select("lender_id, borrower_id")
        .eq("id", agreementId)
        .maybeSingle();

      if (agreementError) {
        console.error("Error fetching agreement for push auth:", agreementError);
        throw agreementError;
      }

      if (!agreement) {
        return new Response(JSON.stringify({ error: "Agreement not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const participantIds = [agreement.lender_id, agreement.borrower_id].filter(
        (id): id is string => typeof id === "string"
      );

      if (!participantIds.includes(callerId) || !participantIds.includes(String(recipientId))) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      targetContext = buildChatTargetContext(targetAgreementId, agreementId);
    } else {
      const participantPair = [callerId, String(recipientId)].sort();
      const [user1Id, user2Id] = participantPair;

      const { data: directChat, error: directChatError } = await supabase
        .from("direct_chats")
        .select("id")
        .eq("user1_id", user1Id)
        .eq("user2_id", user2Id)
        .maybeSingle();

      if (directChatError) {
        console.error("Error fetching direct chat for push auth:", directChatError);
        throw directChatError;
      }

      if (!directChat) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      targetContext = buildChatTargetContext(null, directChat.id);
    }

    if (!targetContext) {
      return new Response(JSON.stringify({ error: "Failed to resolve chat target" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { count: subscriptionCount, error: subError } = await supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", recipientId);

    if (subError) {
      console.error("Error fetching subscriptions:", subError);
      throw subError;
    }

    if (!subscriptionCount || subscriptionCount === 0) {
      return new Response(
        JSON.stringify({ message: "No push subscriptions found for user" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: WebPushPayload = {
      title: `ข้อความจาก ${senderName}`,
      body: truncateMessage(typeof messagePreview === "string" ? messagePreview : null, 100),
      icon: "/pwa-192x192.png",
      badge: "/favicon.png",
      data: {
        url: targetContext.actionUrl,
        relatedId: targetContext.relatedId,
        relatedType: targetContext.relatedType,
      },
    };

    const { error: insertError } = await supabase.from("notifications").insert({
      user_id: recipientId,
      type: "new_message",
      title: payload.title,
      message: payload.body,
      related_type: targetContext.relatedType,
      related_id: targetContext.relatedId,
      action_url: targetContext.actionUrl,
    });

    if (insertError) {
      console.error("Error creating notification:", insertError);
      throw insertError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Notification queued",
        subscriptionCount,
        pushDispatched: false,
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
