import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface PartyInfoFormValue {
  fullName: string;
  idCardLast4: string;
  address: string;
}

interface PartyInfoFormProps {
  value: PartyInfoFormValue;
  onChange: (next: PartyInfoFormValue) => void;
  roleLabel: string;
  disabled?: boolean;
}

export function PartyInfoForm({ value, onChange, roleLabel, disabled }: PartyInfoFormProps) {
  const update = (patch: Partial<PartyInfoFormValue>) => onChange({ ...value, ...patch });

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
        <Label htmlFor="party-id-last4" className="text-sm">
          เลขประจำตัวประชาชน 4 หลักท้าย
        </Label>
        <Input
          id="party-id-last4"
          value={value.idCardLast4}
          onChange={(e) => update({ idCardLast4: e.target.value.replace(/\D/g, "").slice(0, 4) })}
          placeholder="เช่น 1234"
          inputMode="numeric"
          pattern="[0-9]{4}"
          disabled={disabled}
          maxLength={4}
        />
        <p className="text-xs text-muted-foreground mt-1">
          เก็บเฉพาะ 4 ตัวท้ายเพื่อยืนยันตัวตน 9 ตัวแรกจะแสดงเป็น X เพื่อความปลอดภัยตาม PDPA
        </p>
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
