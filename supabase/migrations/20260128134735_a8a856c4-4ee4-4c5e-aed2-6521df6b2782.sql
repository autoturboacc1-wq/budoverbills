-- Add first_name and last_name columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN first_name text,
ADD COLUMN last_name text;

-- Add agreement evidence columns to debt_agreements table
ALTER TABLE public.debt_agreements
ADD COLUMN agreement_text text,
ADD COLUMN lender_confirmed_ip text,
ADD COLUMN lender_confirmed_device text,
ADD COLUMN borrower_confirmed_ip text,
ADD COLUMN borrower_confirmed_device text;

-- Add index for faster lookups on profiles by name
CREATE INDEX idx_profiles_names ON public.profiles (first_name, last_name);

-- Comment for documentation
COMMENT ON COLUMN public.profiles.first_name IS 'ชื่อจริง - เก็บเพื่อใช้ในเอกสารข้อตกลงทางกฎหมาย';
COMMENT ON COLUMN public.profiles.last_name IS 'นามสกุล - เก็บเพื่อใช้ในเอกสารข้อตกลงทางกฎหมาย';
COMMENT ON COLUMN public.debt_agreements.agreement_text IS 'ข้อความข้อตกลงแบบเป็นทางการ (legal text)';
COMMENT ON COLUMN public.debt_agreements.lender_confirmed_ip IS 'IP Address ของผู้ให้ยืมตอนกดยืนยัน';
COMMENT ON COLUMN public.debt_agreements.lender_confirmed_device IS 'Device ID ของผู้ให้ยืมตอนกดยืนยัน';
COMMENT ON COLUMN public.debt_agreements.borrower_confirmed_ip IS 'IP Address ของผู้ยืมตอนกดยืนยัน';
COMMENT ON COLUMN public.debt_agreements.borrower_confirmed_device IS 'Device ID ของผู้ยืมตอนกดยืนยัน';