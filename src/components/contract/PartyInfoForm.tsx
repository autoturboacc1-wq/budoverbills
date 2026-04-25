import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface PartyInfoFormValue {
  fullName: string;
  idCardNumber: string;
  address: string;
  /** @deprecated kept for backward-compat with stored party_info blobs */
  idCardLast4?: string;
}

interface PartyInfoFormProps {
  value: PartyInfoFormValue;
  onChange: (next: PartyInfoFormValue) => void;
  roleLabel: string;
  disabled?: boolean;
}

function validateThaiId(id: string): boolean {
  const digits = id.replace(/\D/g, "");
  if (digits.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(digits[i]) * (13 - i);
  const check = (11 - (sum % 11)) % 10;
  return check === parseInt(digits[12]);
}

export function isIdCardValid(idCardNumber: string): boolean {
  return validateThaiId(idCardNumber);
}

export function PartyInfoForm({ value, onChange, roleLabel, disabled }: PartyInfoFormProps) {
  const update = (patch: Partial<PartyInfoFormValue>) => onChange({ ...value, ...patch });

  const raw = value.idCardNumber ?? "";
  const isValid = raw.length === 13 && validateThaiId(raw);
  const showError = raw.length === 13 && !isValid;

  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor="party-full-name" className="text-sm">
          ชื่อ-นามสกุล{roleLabel ? ` (${roleLabel})` : ""}
        </Label>
        <Input
          id="party-full-name"
          value={value.fullName}
          onChange={(e) => update({ fullName: e.target.value })}
          placeholder="นาย/นาง/นางสาว ชื่อ นามสกุล"
          disabled={disabled}
          maxLength={120}
        />
      </div>

      <div>
        <Label htmlFor="party-id-number" className="text-sm">
          เลขประจำตัวประชาชน 13 หลัก
        </Label>
        <Input
          id="party-id-number"
          value={raw}
          onChange={(e) => update({ idCardNumber: e.target.value.replace(/\D/g, "").slice(0, 13) })}
          placeholder="กรอกเลข 13 หลัก"
          inputMode="numeric"
          pattern="[0-9]{13}"
          disabled={disabled}
          maxLength={13}
          className={showError ? "border-destructive focus-visible:ring-destructive" : ""}
        />
        {showError && (
          <p className="text-xs text-destructive mt-1">เลขประจำตัวประชาชนไม่ถูกต้อง (checksum ไม่ผ่าน)</p>
        )}
        {!showError && (
          <p className="text-xs text-muted-foreground mt-1">
            ใช้เพื่อระบุตัวตนในสัญญา — แสดงในเอกสารเป็น X-XXXX-XXXXX-XX-X ตาม PDPA
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="party-address" className="text-sm">
          ที่อยู่ตามทะเบียนบ้าน / ที่อยู่ปัจจุบัน
        </Label>
        <Textarea
          id="party-address"
          value={value.address}
          onChange={(e) => update({ address: e.target.value })}
          placeholder="บ้านเลขที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด รหัสไปรษณีย์"
          disabled={disabled}
          rows={3}
          maxLength={300}
        />
      </div>
    </div>
  );
}
