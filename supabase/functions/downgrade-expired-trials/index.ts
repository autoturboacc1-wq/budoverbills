import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { constantTimeEquals } from "../_shared/validation.ts";

const INTERNAL_SECRET_HEADER = "x-internal-secret";

function getInternalSecret(req: Request): string | null {
  const headerSecret = req.headers.get(INTERNAL_SECRET_HEADER);
  return headerSecret || null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  try {
    const internalSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");
    if (!internalSecret) {
      throw new Error("Missing INTERNAL_FUNCTION_SECRET");
    }

    const requestSecret = getInternalSecret(req);
    if (!requestSecret || !constantTimeEquals(requestSecret, internalSecret)) {
      console.error("[downgrade-expired-trials] Unauthorized request attempted");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { 
          status: 401,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase.rpc("downgrade_expired_trials");

    if (error) {
      console.error("Error downgrading trials:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        downgraded_count: data,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { 
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
});
