-- Create debt agreements table
CREATE TABLE public.debt_agreements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Parties involved
  lender_id UUID NOT NULL,
  borrower_id UUID,
  borrower_phone TEXT,
  borrower_name TEXT,
  
  -- Agreement details
  principal_amount DECIMAL(12,2) NOT NULL,
  interest_rate DECIMAL(5,2) DEFAULT 0,
  interest_type TEXT NOT NULL DEFAULT 'none' CHECK (interest_type IN ('none', 'flat', 'effective')),
  total_amount DECIMAL(12,2) NOT NULL,
  
  -- Payment schedule
  num_installments INTEGER NOT NULL DEFAULT 1,
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  start_date DATE NOT NULL,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending_confirmation' CHECK (status IN ('pending_confirmation', 'active', 'completed', 'cancelled', 'rescheduling')),
  lender_confirmed BOOLEAN DEFAULT FALSE,
  borrower_confirmed BOOLEAN DEFAULT FALSE,
  
  -- Notes
  description TEXT
);

-- Create installments table for payment tracking
CREATE TABLE public.installments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agreement_id UUID NOT NULL REFERENCES public.debt_agreements(id) ON DELETE CASCADE,
  installment_number INTEGER NOT NULL,
  due_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  principal_portion DECIMAL(12,2) NOT NULL,
  interest_portion DECIMAL(12,2) DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue', 'rescheduled')),
  paid_at TIMESTAMP WITH TIME ZONE,
  payment_proof_url TEXT,
  confirmed_by_lender BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create groups table for bill sharing
CREATE TABLE public.expense_groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create group members table
CREATE TABLE public.group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.expense_groups(id) ON DELETE CASCADE,
  user_id UUID,
  name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create group expenses table
CREATE TABLE public.group_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.expense_groups(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  paid_by_member_id UUID NOT NULL REFERENCES public.group_members(id) ON DELETE CASCADE,
  split_between UUID[] NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.debt_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_expenses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for debt_agreements
CREATE POLICY "Users can view agreements they are part of"
ON public.debt_agreements
FOR SELECT
USING (auth.uid() = lender_id OR auth.uid() = borrower_id);

CREATE POLICY "Users can create agreements as lender"
ON public.debt_agreements
FOR INSERT
WITH CHECK (auth.uid() = lender_id);

CREATE POLICY "Parties can update their own agreements"
ON public.debt_agreements
FOR UPDATE
USING (auth.uid() = lender_id OR auth.uid() = borrower_id);

CREATE POLICY "Only lender can delete pending agreements"
ON public.debt_agreements
FOR DELETE
USING (auth.uid() = lender_id AND status = 'pending_confirmation');

-- RLS Policies for installments
CREATE POLICY "Users can view installments for their agreements"
ON public.installments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.debt_agreements 
    WHERE id = installments.agreement_id 
    AND (lender_id = auth.uid() OR borrower_id = auth.uid())
  )
);

CREATE POLICY "Users can insert installments for their agreements"
ON public.installments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.debt_agreements 
    WHERE id = agreement_id 
    AND lender_id = auth.uid()
  )
);

CREATE POLICY "Users can update installments for their agreements"
ON public.installments
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.debt_agreements 
    WHERE id = installments.agreement_id 
    AND (lender_id = auth.uid() OR borrower_id = auth.uid())
  )
);

-- RLS Policies for expense_groups
CREATE POLICY "Users can view groups they created"
ON public.expense_groups
FOR SELECT
USING (auth.uid() = created_by);

CREATE POLICY "Users can create groups"
ON public.expense_groups
FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their groups"
ON public.expense_groups
FOR UPDATE
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their groups"
ON public.expense_groups
FOR DELETE
USING (auth.uid() = created_by);

-- RLS Policies for group_members
CREATE POLICY "Users can view members of their groups"
ON public.group_members
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.expense_groups 
    WHERE id = group_members.group_id 
    AND created_by = auth.uid()
  )
);

CREATE POLICY "Users can add members to their groups"
ON public.group_members
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.expense_groups 
    WHERE id = group_id 
    AND created_by = auth.uid()
  )
);

CREATE POLICY "Users can update members of their groups"
ON public.group_members
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.expense_groups 
    WHERE id = group_members.group_id 
    AND created_by = auth.uid()
  )
);

CREATE POLICY "Users can delete members from their groups"
ON public.group_members
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.expense_groups 
    WHERE id = group_members.group_id 
    AND created_by = auth.uid()
  )
);

-- RLS Policies for group_expenses
CREATE POLICY "Users can view expenses of their groups"
ON public.group_expenses
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.expense_groups 
    WHERE id = group_expenses.group_id 
    AND created_by = auth.uid()
  )
);

CREATE POLICY "Users can add expenses to their groups"
ON public.group_expenses
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.expense_groups 
    WHERE id = group_id 
    AND created_by = auth.uid()
  )
);

CREATE POLICY "Users can update expenses in their groups"
ON public.group_expenses
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.expense_groups 
    WHERE id = group_expenses.group_id 
    AND created_by = auth.uid()
  )
);

CREATE POLICY "Users can delete expenses from their groups"
ON public.group_expenses
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.expense_groups 
    WHERE id = group_expenses.group_id 
    AND created_by = auth.uid()
  )
);

-- Add triggers for updated_at
CREATE TRIGGER update_debt_agreements_updated_at
  BEFORE UPDATE ON public.debt_agreements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_installments_updated_at
  BEFORE UPDATE ON public.installments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_expense_groups_updated_at
  BEFORE UPDATE ON public.expense_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();