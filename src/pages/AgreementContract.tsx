import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { motion } from "framer-motion";
import { ArrowLeft, FileSignature, Printer, ShieldCheck, Loader2, AlertCircle, Eye, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

import { PageTransition } from "@/components/ux/PageTransition";
import { PasswordConfirmDialog } from "@/components/PasswordConfirmDialog";
import { PartyInfoForm, PartyInfoFormValue } from "@/components/contract/PartyInfoForm";
import {
  CONTRACT_TEMPLATE_VERSION,
  ContractParty,
  ContractSignatureRecord,
  LoanContractData,
  LoanContractTemplate,
} from "@/components/contract/LoanContractTemplate";

import { useAuth } from "@/contexts/AuthContext";
import { useDebtAgreements, DebtAgreement } from "@/hooks/useDebtAgreements";
import { supabase } from "@/integrations/supabase/client";
import { getUserRoleInAgreement } from "@/domains/debt";
import { computeContractHash } from "@/utils/contractHash";
import { getClientIP, getDeviceIdString } from "@/utils/deviceInfo";

interface SignatureRow {
  id: string;
  agreement_id: string;
  signer_role: "lender" | "borrower";
  typed_name: string;
  signed_at: string;
  ip_address: string | null;
  device_id: string | null;
  user_agent: string | null;
  contract_hash_at_sign: string;
}

interface AgreementContractExtras {
  contract_html_snapshot: string | null;
  contract_hash: string | null;
  contract_finalized_at: string | null;
  contract_template_version: string | null;
  lender_party_info: PartyInfoFormValue | null;
  borrower_party_info: PartyInfoFormValue | null;
  place_of_signing: string | null;
  loan_purpose: string | null;
}

const EMPTY_PARTY: PartyInfoFormValue = { fullName: "", idCardLast4: "", address: "" };

function partyToContract(value: PartyInfoFormValue): ContractParty {
  return {
    fullName: value.fullName.trim(),
    idCardLast4: value.idCardLast4.trim(),
    address: value.address.trim(),
  };
}

function buildContractData(args: {
  agreement: DebtAgreement;
  lenderParty: PartyInfoFormValue;
  borrowerParty: PartyInfoFormValue;
  placeOfSigning: string;
  loanPurpose: string;
  contractDateISO: string;
  lenderSignature?: ContractSignatureRecord | null;
  borrowerSignature?: ContractSignatureRecord | null;
}): LoanContractData {
  const installmentAmount = Math.ceil(args.agreement.total_amount / Math.max(1, args.agreement.num_installments));
  return {
    agreementId: args.agreement.id,
    lender: partyToContract(args.lenderParty),
    borrower: partyToContract(args.borrowerParty),
    principalAmount: args.agreement.principal_amount,
    totalAmount: args.agreement.total_amount,
    interestRate: args.agreement.interest_rate || 0,
    interestType: args.agreement.interest_type,
    numInstallments: args.agreement.num_installments,
    frequency: args.agreement.frequency,
    startDate: args.agreement.start_date,
    loanPurpose: args.loanPurpose.trim(),
    placeOfSigning: args.placeOfSigning.trim(),
    contractDateISO: args.contractDateISO,
    installmentAmount,
    lenderSignature: args.lenderSignature ?? null,
    borrowerSignature: args.borrowerSignature ?? null,
  };
}

function signatureFromRow(row: SignatureRow | undefined): ContractSignatureRecord | null {
  if (!row) return null;
  return {
    typedName: row.typed_name,
    signedAtISO: row.signed_at,
    ipAddress: row.ip_address,
    deviceId: row.device_id,
  };
}

export default function AgreementContract() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getAgreement, refresh } = useDebtAgreements();

  const [agreement, setAgreement] = useState<DebtAgreement | null>(null);
  const [extras, setExtras] = useState<AgreementContractExtras | null>(null);
  const [signatures, setSignatures] = useState<SignatureRow[]>([]);
  const [lenderProfileName, setLenderProfileName] = useState<string>("");

  const [lenderParty, setLenderParty] = useState<PartyInfoFormValue>(EMPTY_PARTY);
  const [borrowerParty, setBorrowerParty] = useState<PartyInfoFormValue>(EMPTY_PARTY);
  const [placeOfSigning, setPlaceOfSigning] = useState("");
  const [loanPurpose, setLoanPurpose] = useState("");
  const [typedName, setTypedName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [pdpaConsented, setPdpaConsented] = useState(false);
  const [pdpaCheckbox, setPdpaCheckbox] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isGrantingPdpa, setIsGrantingPdpa] = useState(false);
  const [loading, setLoading] = useState(true);
  const [snapshotVerification, setSnapshotVerification] =
    useState<"unknown" | "verified" | "mismatch">("unknown");

  const PDPA_PURPOSE = "loan_contract_identity";

  const role = useMemo(() => getUserRoleInAgreement(agreement, user?.id), [agreement, user?.id]);
  const isLender = role === "lender";
  const isBorrower = role === "borrower";

  const lenderSignatureRow = signatures.find((s) => s.signer_role === "lender");
  const borrowerSignatureRow = signatures.find((s) => s.signer_role === "borrower");
  const mySignatureRow = signatures.find((s) => (isLender && s.signer_role === "lender") || (isBorrower && s.signer_role === "borrower"));
  const fullySigned = Boolean(lenderSignatureRow && borrowerSignatureRow);

  // ---------- Initial load ----------
  useEffect(() => {
    if (!id) return;
    const found = getAgreement(id);
    setAgreement(found ?? null);
  }, [id, getAgreement]);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [agreementResp, signaturesResp, consentResp] = await Promise.all([
          supabase
            .from("debt_agreements")
            .select(
              "contract_html_snapshot, contract_hash, contract_finalized_at, contract_template_version, lender_party_info, borrower_party_info, place_of_signing, loan_purpose"
            )
            .eq("id", id)
            .maybeSingle(),
          supabase
            .from("agreement_signatures" as never)
            .select("id, agreement_id, signer_role, typed_name, signed_at, ip_address, device_id, user_agent, contract_hash_at_sign")
            .eq("agreement_id", id)
            .order("signed_at", { ascending: true }),
          user?.id
            ? supabase
                .from("agreement_pdpa_consents" as never)
                .select("id")
                .eq("agreement_id", id)
                .eq("user_id", user.id)
                .eq("purpose", PDPA_PURPOSE)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
        ]);

        if (cancelled) return;

        if (agreementResp.data) {
          const data = agreementResp.data as unknown as AgreementContractExtras;
          setExtras(data);
          if (data.lender_party_info) setLenderParty({ ...EMPTY_PARTY, ...data.lender_party_info });
          if (data.borrower_party_info) setBorrowerParty({ ...EMPTY_PARTY, ...data.borrower_party_info });
          if (data.place_of_signing) setPlaceOfSigning(data.place_of_signing);
          if (data.loan_purpose) setLoanPurpose(data.loan_purpose);
        }
        if (signaturesResp.data) setSignatures(signaturesResp.data as unknown as SignatureRow[]);
        if (consentResp && (consentResp as { data: unknown }).data) setPdpaConsented(true);
      } catch (err) {
        console.error("Failed to load contract data", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Re-hash the stored snapshot and compare against the stored hash so we
  // can show a "verified" badge once both parties have signed.  Mismatch
  // indicates someone tampered with the snapshot bytes after signing.
  useEffect(() => {
    let cancelled = false;
    const verify = async () => {
      if (!extras?.contract_html_snapshot || !extras.contract_hash) {
        setSnapshotVerification("unknown");
        return;
      }
      try {
        const recomputed = await computeContractHash(extras.contract_html_snapshot);
        if (cancelled) return;
        setSnapshotVerification(recomputed === extras.contract_hash ? "verified" : "mismatch");
      } catch (err) {
        console.error("Snapshot verification failed", err);
        if (!cancelled) setSnapshotVerification("unknown");
      }
    };
    void verify();
    return () => {
      cancelled = true;
    };
  }, [extras?.contract_html_snapshot, extras?.contract_hash]);

  // Prefill lender's full name from their profile, borrower from agreement
  useEffect(() => {
    if (!agreement) return;

    const prefillLender = async () => {
      if (lenderParty.fullName) return;
      const { data } = await supabase
        .from("profiles")
        .select("first_name, last_name, display_name")
        .eq("user_id", agreement.lender_id)
        .maybeSingle();
      const name = data?.first_name && data?.last_name
        ? `${data.first_name} ${data.last_name}`.trim()
        : data?.display_name?.trim() || "";
      if (name) {
        setLenderProfileName(name);
        if (isLender) setLenderParty((prev) => (prev.fullName ? prev : { ...prev, fullName: name }));
      }
    };
    void prefillLender();

    if (!borrowerParty.fullName && agreement.borrower_name) {
      setBorrowerParty((prev) => (prev.fullName ? prev : { ...prev, fullName: agreement.borrower_name ?? "" }));
    }
  }, [agreement]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Form ----------
  const myParty = isLender ? lenderParty : borrowerParty;
  const setMyParty = isLender ? setLenderParty : setBorrowerParty;

  const canEditMyInfo = !mySignatureRow;
  const canEditPlaceAndPurpose = isLender && !lenderSignatureRow;

  const formIsValid = useMemo(() => {
    if (!myParty.fullName.trim()) return false;
    if (myParty.idCardLast4.replace(/\D/g, "").length !== 4) return false;
    if (!myParty.address.trim()) return false;
    if (isLender) {
      if (!placeOfSigning.trim()) return false;
      if (!loanPurpose.trim()) return false;
      // lender also needs the borrower's expected full name (they provided it on agreement create)
      if (!borrowerParty.fullName.trim()) return false;
    }
    return true;
  }, [myParty, isLender, placeOfSigning, loanPurpose, borrowerParty.fullName]);

  // Build preview contract data using current form state + existing signatures
  const previewData = useMemo<LoanContractData | null>(() => {
    if (!agreement) return null;
    return buildContractData({
      agreement,
      lenderParty,
      borrowerParty,
      placeOfSigning,
      loanPurpose,
      contractDateISO: lenderSignatureRow?.signed_at ?? new Date().toISOString(),
      lenderSignature: signatureFromRow(lenderSignatureRow),
      borrowerSignature: signatureFromRow(borrowerSignatureRow),
    });
  }, [agreement, lenderParty, borrowerParty, placeOfSigning, loanPurpose, lenderSignatureRow, borrowerSignatureRow]);

  // ---------- PDPA consent ----------
  const handleGrantPdpa = async () => {
    if (!agreement || !user) return;
    if (!pdpaCheckbox) {
      toast.error("กรุณาทำเครื่องหมายยอมรับ PDPA");
      return;
    }
    setIsGrantingPdpa(true);
    try {
      const [ip] = await Promise.all([getClientIP()]);
      const { error } = await supabase
        .from("agreement_pdpa_consents" as never)
        .insert({
          agreement_id: agreement.id,
          user_id: user.id,
          purpose: PDPA_PURPOSE,
          ip_address: ip,
          user_agent: navigator.userAgent,
        } as never);
      if (error && !String(error.message ?? "").includes("duplicate")) throw error;
      setPdpaConsented(true);
      toast.success("บันทึกความยินยอม PDPA แล้ว");
    } catch (err) {
      console.error("PDPA consent error", err);
      toast.error("ไม่สามารถบันทึกความยินยอมได้", {
        description: (err as { message?: string })?.message,
      });
    } finally {
      setIsGrantingPdpa(false);
    }
  };

  // ---------- Signing ----------
  const handleSignClick = () => {
    if (!agreement || !user || !role) {
      toast.error("ไม่สามารถลงนามได้");
      return;
    }
    if (!formIsValid) {
      toast.error("กรุณากรอกข้อมูลให้ครบถ้วน");
      return;
    }
    if (isBorrower && !lenderSignatureRow) {
      toast.error("กรุณารอผู้ให้กู้ลงนามก่อน");
      return;
    }
    if (!typedName.trim()) {
      toast.error("กรุณาพิมพ์ชื่อ-นามสกุลเพื่อยืนยันการลงนาม");
      return;
    }
    if (typedName.trim() !== myParty.fullName.trim()) {
      toast.error("ชื่อที่ลงนามต้องตรงกับชื่อในข้อมูลคู่สัญญา");
      return;
    }
    if (!accepted) {
      toast.error("กรุณายอมรับเงื่อนไขก่อนลงนาม");
      return;
    }
    setShowPasswordConfirm(true);
  };

  const handleSignConfirmed = async () => {
    if (!agreement || !user || !role) return;
    setIsSigning(true);
    try {
      const contractDateISO = lenderSignatureRow?.signed_at ?? new Date().toISOString();

      const data = buildContractData({
        agreement,
        lenderParty: isLender ? lenderParty : (extras?.lender_party_info ?? lenderParty),
        borrowerParty: isBorrower ? borrowerParty : (extras?.borrower_party_info ?? borrowerParty),
        placeOfSigning: isLender ? placeOfSigning : (extras?.place_of_signing ?? placeOfSigning),
        loanPurpose: isLender ? loanPurpose : (extras?.loan_purpose ?? loanPurpose),
        contractDateISO,
        // Hash should cover the contract text only — exclude existing signature metadata
        // so the hash is a stable function of the agreed-upon TERMS.
        lenderSignature: null,
        borrowerSignature: null,
      });

      const html = renderToStaticMarkup(<LoanContractTemplate data={data} />);
      const hash = await computeContractHash(html);

      const [ip, device] = await Promise.all([getClientIP(), Promise.resolve(getDeviceIdString())]);

      const partyInfo = isLender ? lenderParty : borrowerParty;

      const { error } = await supabase.rpc("sign_agreement_contract" as never, {
        p_agreement_id: agreement.id,
        p_signer_role: role,
        p_typed_name: typedName.trim(),
        p_party_info: {
          fullName: partyInfo.fullName.trim(),
          idCardLast4: partyInfo.idCardLast4.trim(),
          address: partyInfo.address.trim(),
        },
        p_contract_html: html,
        p_contract_hash: hash,
        p_contract_template_ver: CONTRACT_TEMPLATE_VERSION,
        p_place_of_signing: isLender ? placeOfSigning.trim() : null,
        p_loan_purpose: isLender ? loanPurpose.trim() : null,
        p_ip_address: ip,
        p_device_id: device,
        p_user_agent: navigator.userAgent,
      } as never);

      if (error) throw error;

      toast.success("ลงนามสัญญาสำเร็จ");

      // Refresh state
      const [agreementResp, signaturesResp] = await Promise.all([
        supabase
          .from("debt_agreements")
          .select(
            "contract_html_snapshot, contract_hash, contract_finalized_at, contract_template_version, lender_party_info, borrower_party_info, place_of_signing, loan_purpose"
          )
          .eq("id", agreement.id)
          .maybeSingle(),
        supabase
          .from("agreement_signatures" as never)
          .select("id, agreement_id, signer_role, typed_name, signed_at, ip_address, device_id, user_agent, contract_hash_at_sign")
          .eq("agreement_id", agreement.id)
          .order("signed_at", { ascending: true }),
      ]);
      if (agreementResp.data) setExtras(agreementResp.data as unknown as AgreementContractExtras);
      if (signaturesResp.data) setSignatures(signaturesResp.data as unknown as SignatureRow[]);
      await refresh();

      setShowPasswordConfirm(false);
      setTypedName("");
    } catch (err) {
      const message = (err as { message?: string })?.message ?? "ไม่สามารถลงนามได้";
      console.error("Sign contract error", err);
      toast.error(message);
    } finally {
      setIsSigning(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // ---------- Render ----------
  if (!agreement) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center">
        <p className="text-muted-foreground">{loading ? "กำลังโหลด..." : "ไม่พบข้อตกลง"}</p>
      </div>
    );
  }

  if (!isLender && !isBorrower) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center">
        <p className="text-muted-foreground">คุณไม่มีสิทธิ์ดูสัญญานี้</p>
      </div>
    );
  }

  const otherSigned = isLender ? Boolean(borrowerSignatureRow) : Boolean(lenderSignatureRow);

  return (
    <PageTransition>
      <div className="min-h-screen bg-gradient-hero pb-24 print:bg-white print:pb-0">
        <div className="max-w-3xl mx-auto px-4 print:max-w-none print:px-0">
          {/* Header — hidden on print */}
          <motion.header
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between gap-4 py-4 print:hidden"
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(`/agreement/${agreement.id}/confirm`)}
                className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
                aria-label="ย้อนกลับ"
              >
                <ArrowLeft className="w-5 h-5 text-secondary-foreground" />
              </button>
              <h1 className="text-xl font-heading font-semibold text-foreground">หนังสือสัญญากู้ยืมเงิน</h1>
            </div>

            {fullySigned && (
              <Button variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />
                พิมพ์ / บันทึก PDF
              </Button>
            )}
          </motion.header>

          {/* Status banner */}
          {!fullySigned && (
            <div className="bg-status-pending/10 border border-status-pending/20 rounded-2xl p-4 mb-6 print:hidden">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-status-pending mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">
                    {mySignatureRow
                      ? otherSigned
                        ? "ลงนามครบถ้วนแล้ว"
                        : "คุณลงนามแล้ว — รออีกฝ่ายลงนาม"
                      : "กรุณาตรวจสอบและลงนามสัญญา"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {lenderSignatureRow ? "ผู้ให้กู้ลงนามแล้ว" : "รอผู้ให้กู้ลงนาม"}
                    {" • "}
                    {borrowerSignatureRow ? "ผู้กู้ลงนามแล้ว" : "รอผู้กู้ลงนาม"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {fullySigned && (
            <div
              className={`rounded-2xl p-4 mb-6 border print:hidden ${
                snapshotVerification === "mismatch"
                  ? "bg-status-overdue/10 border-status-overdue/30"
                  : "bg-status-paid/10 border-status-paid/20"
              }`}
            >
              <div className="flex items-start gap-3">
                {snapshotVerification === "mismatch" ? (
                  <ShieldAlert className="w-5 h-5 text-status-overdue mt-0.5" />
                ) : (
                  <ShieldCheck className="w-5 h-5 text-status-paid mt-0.5" />
                )}
                <div>
                  <p className="font-medium text-foreground">
                    {snapshotVerification === "verified" && "สัญญาลงนามครบ — ตรวจสอบ hash ตรงต้นฉบับ"}
                    {snapshotVerification === "mismatch" && "⚠️ Hash ของสัญญาไม่ตรงกับต้นฉบับที่บันทึกไว้"}
                    {snapshotVerification === "unknown" && "สัญญาลงนามครบทั้งสองฝ่ายแล้ว"}
                  </p>
                  <p className="text-sm text-muted-foreground break-all">
                    เลขกำกับเอกสาร (hash): {extras?.contract_hash || "—"}
                  </p>
                  {snapshotVerification === "mismatch" && (
                    <p className="text-xs text-status-overdue mt-1">
                      อย่าใช้เป็นหลักฐานก่อนตรวจสอบเพิ่มเติม กรุณาติดต่อทีมสนับสนุน
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* If finalized — render from frozen structured data (safer than dangerouslySetInnerHTML).
              The stored HTML snapshot is kept server-side as the hashed legal artifact. */}
          {fullySigned && extras?.lender_party_info && extras?.borrower_party_info ? (
            <div className="bg-white rounded-2xl shadow-card overflow-x-auto print:rounded-none print:shadow-none print:overflow-visible">
              <LoanContractTemplate
                data={buildContractData({
                  agreement,
                  lenderParty: { ...EMPTY_PARTY, ...extras.lender_party_info },
                  borrowerParty: { ...EMPTY_PARTY, ...extras.borrower_party_info },
                  placeOfSigning: extras.place_of_signing ?? "",
                  loanPurpose: extras.loan_purpose ?? "",
                  contractDateISO: lenderSignatureRow?.signed_at ?? extras.contract_finalized_at ?? new Date().toISOString(),
                  lenderSignature: signatureFromRow(lenderSignatureRow),
                  borrowerSignature: signatureFromRow(borrowerSignatureRow),
                })}
              />
            </div>
          ) : !pdpaConsented && !mySignatureRow ? (
            /* PDPA consent gate — required before collecting ID/address */
            <div className="bg-card rounded-2xl p-5 shadow-card mb-6 space-y-4 print:hidden">
              <h2 className="font-medium text-foreground flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                ความยินยอมในการเก็บข้อมูลส่วนบุคคล (PDPA)
              </h2>
              <div className="text-sm text-foreground space-y-2">
                <p>เพื่อจัดทำหนังสือสัญญากู้ยืมเงินให้สามารถใช้เป็นหลักฐานในชั้นศาลได้ Budoverbills จำเป็นต้องเก็บข้อมูลส่วนบุคคลของคุณดังนี้:</p>
                <ul className="list-disc list-inside text-muted-foreground ml-2 space-y-1">
                  <li>ชื่อ-นามสกุลเต็ม</li>
                  <li>เลขประจำตัวประชาชน 4 หลักท้าย</li>
                  <li>ที่อยู่ตามทะเบียนบ้านหรือที่อยู่ปัจจุบัน</li>
                  <li>ลายมือชื่ออิเล็กทรอนิกส์ (พิมพ์ชื่อ + IP + อุปกรณ์ + เวลาลงนาม)</li>
                </ul>
                <p className="mt-2">ข้อมูลข้างต้นจะถูกใช้เฉพาะการจัดทำสัญญากู้ยืมฉบับนี้เพื่อใช้เป็นหลักฐานทางกฎหมาย และจะถูกเก็บตลอดอายุสัญญาตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562</p>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/40 border border-border">
                <Checkbox
                  id="pdpa-checkbox"
                  checked={pdpaCheckbox}
                  onCheckedChange={(c) => setPdpaCheckbox(c === true)}
                  className="mt-0.5"
                />
                <label htmlFor="pdpa-checkbox" className="text-sm text-foreground cursor-pointer leading-relaxed">
                  ข้าพเจ้ายินยอมให้ Budoverbills เก็บและใช้ข้อมูลส่วนบุคคลข้างต้น
                  เพื่อจัดทำสัญญากู้ยืมเงินฉบับนี้
                </label>
              </div>

              <Button
                className="w-full h-11"
                onClick={handleGrantPdpa}
                disabled={!pdpaCheckbox || isGrantingPdpa}
              >
                {isGrantingPdpa ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4 mr-2" />
                )}
                ยินยอมและดำเนินการต่อ
              </Button>
            </div>
          ) : (
            <>
              {/* Editable form section */}
              <div className="bg-card rounded-2xl p-5 shadow-card mb-6 space-y-5 print:hidden">
                <h2 className="font-medium text-foreground flex items-center gap-2">
                  <FileSignature className="w-4 h-4" />
                  ข้อมูล{isLender ? "ผู้ให้กู้ (คุณ)" : "ผู้กู้ (คุณ)"}
                </h2>
                <PartyInfoForm
                  value={myParty}
                  onChange={setMyParty}
                  roleLabel={isLender ? "ผู้ให้กู้" : "ผู้กู้"}
                  disabled={!canEditMyInfo}
                />

                {isLender && (
                  <>
                    <Separator />
                    <h2 className="font-medium text-foreground">ข้อมูลผู้กู้ (ตามที่ระบุไว้)</h2>
                    <div>
                      <Label htmlFor="borrower-full-name" className="text-sm">ชื่อ-นามสกุลผู้กู้</Label>
                      <Input
                        id="borrower-full-name"
                        value={borrowerParty.fullName}
                        onChange={(e) => setBorrowerParty({ ...borrowerParty, fullName: e.target.value })}
                        disabled={!canEditPlaceAndPurpose}
                        placeholder="ผู้กู้จะกรอกข้อมูลที่อยู่และเลขบัตรเองตอนลงนาม"
                      />
                    </div>

                    <Separator />
                    <h2 className="font-medium text-foreground">รายละเอียดสัญญา</h2>
                    <div>
                      <Label htmlFor="place-of-signing" className="text-sm">สถานที่ทำสัญญา</Label>
                      <Input
                        id="place-of-signing"
                        value={placeOfSigning}
                        onChange={(e) => setPlaceOfSigning(e.target.value)}
                        placeholder="เช่น กรุงเทพมหานคร"
                        disabled={!canEditPlaceAndPurpose}
                        maxLength={120}
                      />
                    </div>
                    <div>
                      <Label htmlFor="loan-purpose" className="text-sm">วัตถุประสงค์การกู้</Label>
                      <Input
                        id="loan-purpose"
                        value={loanPurpose}
                        onChange={(e) => setLoanPurpose(e.target.value)}
                        placeholder="เช่น ใช้จ่ายในครัวเรือน / ลงทุนกิจการ"
                        disabled={!canEditPlaceAndPurpose}
                        maxLength={200}
                      />
                    </div>
                  </>
                )}

                {isBorrower && (
                  <>
                    <Separator />
                    <div className="bg-secondary/40 rounded-xl p-3 text-sm text-muted-foreground">
                      <p>สถานที่ทำสัญญา: <span className="text-foreground font-medium">{extras?.place_of_signing || placeOfSigning || "—"}</span></p>
                      <p>วัตถุประสงค์: <span className="text-foreground font-medium">{extras?.loan_purpose || loanPurpose || "—"}</span></p>
                      <p>ผู้ให้กู้: <span className="text-foreground font-medium">{lenderParty.fullName || lenderProfileName || "—"}</span></p>
                    </div>
                  </>
                )}

                {!mySignatureRow && (
                  <Button variant="outline" className="w-full" onClick={() => setShowPreview(true)} disabled={!previewData}>
                    <Eye className="w-4 h-4 mr-2" />
                    ดูตัวอย่างสัญญาก่อนลงนาม
                  </Button>
                )}
              </div>

              {/* Sign section — only when user hasn't signed yet */}
              {!mySignatureRow && (
                <div className="bg-card rounded-2xl p-5 shadow-card mb-6 space-y-4 print:hidden">
                  <h2 className="font-medium text-foreground flex items-center gap-2">
                    <FileSignature className="w-4 h-4 text-primary" />
                    ลงลายมือชื่ออิเล็กทรอนิกส์
                  </h2>

                  <div>
                    <Label htmlFor="typed-name" className="text-sm">พิมพ์ชื่อ-นามสกุลของคุณเพื่อลงนาม</Label>
                    <Input
                      id="typed-name"
                      value={typedName}
                      onChange={(e) => setTypedName(e.target.value)}
                      placeholder="พิมพ์ชื่อ-นามสกุลให้ตรงกับข้อมูลด้านบน"
                      maxLength={120}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      การพิมพ์ชื่อนี้ ถือเป็นลายมือชื่ออิเล็กทรอนิกส์ ตาม พ.ร.บ.ว่าด้วยธุรกรรมทางอิเล็กทรอนิกส์ พ.ศ. 2544
                    </p>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-lg bg-secondary/40 border border-border">
                    <Checkbox
                      id="accept-contract"
                      checked={accepted}
                      onCheckedChange={(c) => setAccepted(c === true)}
                      className="mt-0.5"
                    />
                    <label htmlFor="accept-contract" className="text-sm text-foreground cursor-pointer leading-relaxed">
                      ข้าพเจ้าได้อ่านและเข้าใจสัญญาฉบับนี้โดยตลอดแล้ว
                      เห็นว่าถูกต้องตรงตามเจตนา และยินยอมให้บันทึก IP address กับ device fingerprint
                      เพื่อใช้เป็นหลักฐานทางกฎหมาย
                    </label>
                  </div>

                  <Button
                    className="w-full h-12"
                    onClick={handleSignClick}
                    disabled={!formIsValid || !typedName.trim() || !accepted}
                  >
                    <FileSignature className="w-4 h-4 mr-2" />
                    ลงนามสัญญา
                  </Button>
                </div>
              )}

              {/* If user signed but other party didn't, show their signed state + still render preview from form */}
              {mySignatureRow && !fullySigned && (
                <div className="bg-card rounded-2xl p-5 shadow-card mb-6 print:hidden">
                  <p className="text-sm text-muted-foreground">
                    คุณลงนามเรียบร้อยแล้วเมื่อ{" "}
                    <span className="text-foreground font-medium">
                      {new Date(mySignatureRow.signed_at).toLocaleString("th-TH")}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground break-all mt-2">
                    Hash ของสัญญาที่คุณลงนาม: {mySignatureRow.contract_hash_at_sign}
                  </p>
                </div>
              )}

              {/* Render the live (form-driven) contract for everyone to see */}
              {previewData && (
                <div className="bg-white rounded-2xl shadow-card overflow-x-auto print:rounded-none print:shadow-none print:overflow-visible">
                  <LoanContractTemplate data={previewData} />
                </div>
              )}
            </>
          )}

          {/* Disclaimer */}
          <div className="mt-4 p-3 rounded-lg bg-status-pending/10 border border-status-pending/20 print:hidden">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-status-pending mt-0.5" />
              <p className="text-xs text-status-pending">
                Budoverbills เป็นเครื่องมือบันทึกข้อตกลง ไม่ใช่คู่สัญญา
                คู่สัญญาทั้งสองฝ่ายเป็นผู้รับผิดชอบเนื้อหาและการปฏิบัติตามสัญญา
              </p>
            </div>
          </div>
        </div>

        {/* Preview dialog */}
        {showPreview && previewData && (
          <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 print:hidden">
            <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h3 className="font-semibold text-foreground">ตัวอย่างสัญญา</h3>
                <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>ปิด</Button>
              </div>
              <ScrollArea className="flex-1">
                <LoanContractTemplate data={previewData} />
              </ScrollArea>
            </div>
          </div>
        )}

        {/* Password confirm */}
        <PasswordConfirmDialog
          open={showPasswordConfirm}
          onOpenChange={setShowPasswordConfirm}
          onConfirm={handleSignConfirmed}
          title="ยืนยันการลงนามสัญญา"
          description="กรุณาใส่รหัสผ่านเพื่อลงนามสัญญาฉบับนี้"
          confirmButtonText="ลงนาม"
          isLoading={isSigning}
        />

        {/* Loading overlay */}
        {isSigning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 print:hidden">
            <div className="bg-card rounded-xl px-6 py-4 flex items-center gap-3 shadow-lg">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm">กำลังบันทึกสัญญา...</span>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
}

