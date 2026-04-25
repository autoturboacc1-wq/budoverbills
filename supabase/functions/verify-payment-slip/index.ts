// verify-payment-slip
//
// ============================================================================
//  STATUS: OFF BY DEFAULT — DO NOT ENABLE PROVIDER UNTIL TRACTION SIGNAL
// ============================================================================
//  This function is deployed but inert until SLIP_OCR_PROVIDER is set to a
//  non-"none" value in Supabase secrets.  As long as it stays "none" the
//  function returns 200 with skipped:provider_not_configured and the manual
//  lender-confirm flow is the only path that runs.
//
//  Turn the provider ON only when ALL of these are true:
//    - Sustained volume of ~50+ slip submissions per day, OR
//    - Multiple users complaining that lenders take too long to confirm, OR
//    - First confirmed fraud incident (faked screenshot accepted).
//  Before then the per-call cost (and the PDPA / DPA paperwork required to
//  ship slip images to a third-party OCR vendor) is not justified by the
//  manual review load.  Building anti-fraud before having fraud is premature.
//
//  When you do flip it on:
//    1. Sign up at https://easyslip.com (or chosen provider).
//    2. Sign a DPA — slip images contain bank account numbers (PDPA).
//    3. supabase secrets set SLIP_OCR_PROVIDER=easyslip SLIP_OCR_API_KEY=...
//    4. Watch slip_verifications.ocr_status distribution for a week.
//       Tune SLIP_OCR_AMOUNT_TOLERANCE if matched-rate is too low.
// ============================================================================
//
// Authenticated edge function (verify_jwt = true).  Borrower invokes it
// fire-and-forget after submit_installment_slip succeeds; lender's UI also
// invokes it on demand if no result is attached yet.
//
// Flow:
//   1. Auth caller is a participant (lender or borrower) of the agreement
//      that owns the slip_verifications row.
//   2. Pull the slip file from storage with the service role.
//   3. Hand it to an OCR provider (easyslip-style) read from env.  If no
//      provider is configured, return early with provider_not_configured —
//      the manual confirm flow is unaffected.
//   4. Compare against expected installment amount and (if known) the
//      lender's saved bank account.  Compute mismatch reasons.
//   5. Persist via record_slip_ocr_result RPC (service role).
//
// Configurable env (set in Supabase secrets):
//   SLIP_OCR_PROVIDER          easyslip | none      (default: none)
//   SLIP_OCR_API_KEY           bearer token for the provider
//   SLIP_OCR_ENDPOINT          override default endpoint
//   SLIP_OCR_AMOUNT_TOLERANCE  decimal, default 0.01 (1 satang)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isValidUuid } from "../_shared/validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "null",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const PAYMENT_SLIP_BUCKET = "payment-slips";

type OcrStatus = "matched" | "mismatched" | "failed";

interface OcrParseResult {
  amount: number | null;
  transferTime: string | null;
  receiverAccount: string | null;
  receiverName: string | null;
  reference: string | null;
  raw: unknown;
}

interface VerificationRow {
  id: string;
  installment_id: string;
  agreement_id: string;
  submitted_amount: number;
  slip_url: string;
  status: string;
  ocr_status: string | null;
}

interface InstallmentRow {
  id: string;
  amount: number;
  agreement_id: string;
}

interface AgreementRow {
  lender_id: string;
  borrower_id: string;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function getAmountTolerance(): number {
  const raw = Deno.env.get("SLIP_OCR_AMOUNT_TOLERANCE");
  if (!raw) return 0.01;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0.01;
}

function lastFour(account: string | null | undefined): string | null {
  if (!account) return null;
  const digits = account.replace(/\D+/g, "");
  return digits.length >= 4 ? digits.slice(-4) : digits || null;
}

async function callEasyslip(file: Blob, fileName: string): Promise<OcrParseResult> {
  const apiKey = Deno.env.get("SLIP_OCR_API_KEY");
  const endpoint = Deno.env.get("SLIP_OCR_ENDPOINT") ?? "https://developer.easyslip.com/api/v1/verify";

  if (!apiKey) {
    throw new Error("SLIP_OCR_API_KEY is not set");
  }

  const form = new FormData();
  form.append("file", file, fileName);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload || typeof payload !== "object") {
    throw new Error(`easyslip http ${response.status}`);
  }

  // easyslip response shape (best-effort; we keep raw for audit):
  //   { status: "ok", data: { amount: { amount: number },
  //     date: ISO string, receiver: { account: { value }, name: { th } },
  //     transRef } }
  const data = (payload as Record<string, unknown>).data as Record<string, unknown> | undefined;
  if (!data) {
    return { amount: null, transferTime: null, receiverAccount: null, receiverName: null, reference: null, raw: payload };
  }

  const amountField = data.amount as { amount?: unknown } | number | undefined;
  const amount = typeof amountField === "number"
    ? amountField
    : typeof (amountField as { amount?: unknown })?.amount === "number"
      ? ((amountField as { amount: number }).amount)
      : null;

  const dateField = data.date;
  const transferTime = typeof dateField === "string" ? dateField : null;

  const receiver = data.receiver as Record<string, unknown> | undefined;
  const accountField = receiver?.account as { value?: unknown } | undefined;
  const receiverAccount = typeof accountField?.value === "string" ? accountField.value : null;
  const nameField = receiver?.name as { th?: unknown; en?: unknown } | undefined;
  const receiverName = typeof nameField?.th === "string"
    ? nameField.th
    : typeof nameField?.en === "string"
      ? nameField.en
      : null;

  const reference = typeof data.transRef === "string" ? data.transRef : null;

  return { amount, transferTime, receiverAccount, receiverName, reference, raw: payload };
}

function evaluateMatch(args: {
  parsed: OcrParseResult;
  expectedAmount: number;
  expectedAccountLast4: string | null;
  tolerance: number;
}): { status: OcrStatus; reasons: string[] } {
  const reasons: string[] = [];

  if (args.parsed.amount === null) {
    reasons.push("amount_unreadable");
  } else if (args.parsed.amount + args.tolerance < args.expectedAmount) {
    reasons.push("amount_low");
  } else if (args.parsed.amount > args.expectedAmount + args.tolerance) {
    // Borrower paying extra is allowed by submit_installment_slip, so this
    // is informational only — do not flip the status to mismatched.
    reasons.push("amount_high");
  }

  if (args.expectedAccountLast4) {
    const last4 = lastFour(args.parsed.receiverAccount);
    if (!last4) {
      reasons.push("receiver_unreadable");
    } else if (last4 !== args.expectedAccountLast4) {
      reasons.push("receiver_mismatch");
    }
  }

  // Ignore amount_high when classifying; everything else is a hard mismatch.
  const blockingReasons = reasons.filter((r) => r !== "amount_high");
  const status: OcrStatus = blockingReasons.length === 0 ? "matched" : "mismatched";
  return { status, reasons };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    return jsonResponse({ error: "Missing Supabase environment variables" }, 500);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const bearerToken = getBearerToken(req);
  if (!bearerToken) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(bearerToken);
  const callerId = userData.user?.id ?? null;
  if (userError || !callerId) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => null) as { verificationId?: unknown } | null;
  if (!body || !isValidUuid(body.verificationId)) {
    return jsonResponse({ error: "Invalid verificationId" }, 400);
  }
  const verificationId = body.verificationId;

  const { data: verification, error: verErr } = await supabase
    .from("slip_verifications")
    .select("id, installment_id, agreement_id, submitted_amount, slip_url, status, ocr_status")
    .eq("id", verificationId)
    .maybeSingle<VerificationRow>();

  if (verErr) {
    console.error("verification fetch failed", verErr);
    return jsonResponse({ error: "Lookup failed" }, 500);
  }
  if (!verification) {
    return jsonResponse({ error: "Verification not found" }, 404);
  }

  if (verification.status !== "pending") {
    return jsonResponse({ skipped: "already_resolved", status: verification.status }, 200);
  }

  if (verification.ocr_status) {
    return jsonResponse({ skipped: "already_processed", ocr_status: verification.ocr_status }, 200);
  }

  const { data: agreement, error: agErr } = await supabase
    .from("debt_agreements")
    .select("lender_id, borrower_id")
    .eq("id", verification.agreement_id)
    .maybeSingle<AgreementRow>();

  if (agErr || !agreement) {
    console.error("agreement fetch failed", agErr);
    return jsonResponse({ error: "Agreement not found" }, 404);
  }

  if (agreement.lender_id !== callerId && agreement.borrower_id !== callerId) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const provider = (Deno.env.get("SLIP_OCR_PROVIDER") ?? "none").toLowerCase();
  if (provider === "none") {
    return jsonResponse({ skipped: "provider_not_configured" }, 200);
  }

  if (provider !== "easyslip") {
    return jsonResponse({ skipped: "unknown_provider", provider }, 200);
  }

  const { data: installment, error: instErr } = await supabase
    .from("installments")
    .select("id, amount, agreement_id")
    .eq("id", verification.installment_id)
    .maybeSingle<InstallmentRow>();

  if (instErr || !installment) {
    console.error("installment fetch failed", instErr);
    return jsonResponse({ error: "Installment not found" }, 404);
  }

  // Lender's preferred receiver account (best-effort match on last 4).
  const { data: bankAccounts } = await supabase
    .from("user_bank_accounts")
    .select("account_number, is_default")
    .eq("user_id", agreement.lender_id);

  const expectedAccountLast4 = (() => {
    const list = (bankAccounts ?? []) as Array<{ account_number: string | null; is_default: boolean | null }>;
    const def = list.find((row) => row.is_default);
    const candidate = def ?? list[0];
    return candidate ? lastFour(candidate.account_number ?? "") : null;
  })();

  const { data: fileData, error: dlErr } = await supabase.storage
    .from(PAYMENT_SLIP_BUCKET)
    .download(verification.slip_url);

  if (dlErr || !fileData) {
    console.error("slip download failed", dlErr);
    await supabase.rpc("record_slip_ocr_result", {
      p_verification_id: verificationId,
      p_ocr_status: "failed",
      p_ocr_amount: null,
      p_ocr_transfer_time: null,
      p_ocr_receiver_account: null,
      p_ocr_receiver_name: null,
      p_ocr_reference: null,
      p_ocr_mismatch_reasons: ["download_failed"],
      p_ocr_provider: provider,
      p_ocr_payload: null,
    });
    return jsonResponse({ ocr_status: "failed", reason: "download_failed" }, 200);
  }

  const fileName = verification.slip_url.split("/").pop() ?? "slip";

  let parsed: OcrParseResult;
  try {
    parsed = await callEasyslip(fileData, fileName);
  } catch (err) {
    console.error("ocr provider call failed", err);
    await supabase.rpc("record_slip_ocr_result", {
      p_verification_id: verificationId,
      p_ocr_status: "failed",
      p_ocr_amount: null,
      p_ocr_transfer_time: null,
      p_ocr_receiver_account: null,
      p_ocr_receiver_name: null,
      p_ocr_reference: null,
      p_ocr_mismatch_reasons: ["provider_error"],
      p_ocr_provider: provider,
      p_ocr_payload: { error: err instanceof Error ? err.message : String(err) },
    });
    return jsonResponse({ ocr_status: "failed", reason: "provider_error" }, 200);
  }

  // Duplicate-reference detection: the same transRef should never appear on
  // two pending slips for the same agreement (likely a re-uploaded screenshot).
  let duplicateOfReference = false;
  if (parsed.reference) {
    const { data: dupes } = await supabase
      .from("slip_verifications")
      .select("id")
      .eq("ocr_reference", parsed.reference)
      .neq("id", verificationId)
      .limit(1);
    duplicateOfReference = (dupes ?? []).length > 0;
  }

  const { status, reasons } = evaluateMatch({
    parsed,
    expectedAmount: Number(installment.amount),
    expectedAccountLast4,
    tolerance: getAmountTolerance(),
  });

  const finalReasons = duplicateOfReference ? [...reasons, "duplicate_reference"] : reasons;
  const finalStatus: OcrStatus = duplicateOfReference ? "mismatched" : status;

  const { error: rpcErr } = await supabase.rpc("record_slip_ocr_result", {
    p_verification_id: verificationId,
    p_ocr_status: finalStatus,
    p_ocr_amount: parsed.amount,
    p_ocr_transfer_time: parsed.transferTime,
    p_ocr_receiver_account: parsed.receiverAccount,
    p_ocr_receiver_name: parsed.receiverName,
    p_ocr_reference: parsed.reference,
    p_ocr_mismatch_reasons: finalReasons.length > 0 ? finalReasons : null,
    p_ocr_provider: provider,
    p_ocr_payload: parsed.raw as Record<string, unknown> | null,
  });

  if (rpcErr) {
    console.error("record_slip_ocr_result failed", rpcErr);
    return jsonResponse({ error: "Failed to record OCR result" }, 500);
  }

  return jsonResponse({
    ocr_status: finalStatus,
    mismatch_reasons: finalReasons,
    expected_amount: Number(installment.amount),
    parsed_amount: parsed.amount,
  }, 200);
});
