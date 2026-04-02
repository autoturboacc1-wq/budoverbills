-- ============================================
-- ACTION-DRIVEN SYSTEM: Chat & Notification Schema
-- ============================================

-- 1. Create priority enum for notifications
CREATE TYPE public.notification_priority AS ENUM ('critical', 'important', 'info');

-- 2. Create pending action type enum for chat rooms
CREATE TYPE public.pending_action_type AS ENUM ('pay', 'confirm', 'extend', 'none');

-- 3. Create chat room type enum
CREATE TYPE public.chat_room_type AS ENUM ('debt', 'agreement', 'casual');

-- 4. Add priority column to notifications table
ALTER TABLE public.notifications 
ADD COLUMN priority notification_priority NOT NULL DEFAULT 'info';

-- 5. Add action_url column for deep linking
ALTER TABLE public.notifications 
ADD COLUMN action_url TEXT;

-- 6. Create chat_rooms table for room metadata
CREATE TABLE public.chat_rooms (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    -- Can link to either agreement or direct_chat
    agreement_id UUID REFERENCES public.debt_agreements(id) ON DELETE CASCADE,
    direct_chat_id UUID REFERENCES public.direct_chats(id) ON DELETE CASCADE,
    room_type chat_room_type NOT NULL DEFAULT 'casual',
    has_pending_action BOOLEAN NOT NULL DEFAULT false,
    pending_action_type pending_action_type NOT NULL DEFAULT 'none',
    pending_action_for UUID, -- User ID who needs to take action
    last_message TEXT,
    last_message_at TIMESTAMP WITH TIME ZONE,
    unread_count_user1 INTEGER NOT NULL DEFAULT 0,
    unread_count_user2 INTEGER NOT NULL DEFAULT 0,
    user1_id UUID NOT NULL,
    user2_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    -- Ensure each agreement/direct_chat has only one room
    CONSTRAINT chat_rooms_agreement_unique UNIQUE (agreement_id),
    CONSTRAINT chat_rooms_direct_chat_unique UNIQUE (direct_chat_id),
    -- Must have exactly one reference
    CONSTRAINT chat_rooms_one_reference CHECK (
        (agreement_id IS NOT NULL AND direct_chat_id IS NULL) OR
        (agreement_id IS NULL AND direct_chat_id IS NOT NULL)
    )
);

-- 7. Enable RLS on chat_rooms
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;

-- 8. RLS Policies for chat_rooms
CREATE POLICY "Users can view their own chat rooms"
ON public.chat_rooms
FOR SELECT
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can update their own chat rooms"
ON public.chat_rooms
FOR UPDATE
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "System can insert chat rooms"
ON public.chat_rooms
FOR INSERT
WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

-- 9. Create function to sync chat room from agreement
CREATE OR REPLACE FUNCTION public.sync_chat_room_from_agreement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_room_type chat_room_type;
    v_has_pending BOOLEAN := false;
    v_pending_type pending_action_type := 'none';
    v_pending_for UUID;
    v_has_overdue BOOLEAN;
    v_has_pending_payment BOOLEAN;
    v_has_pending_confirm BOOLEAN;
BEGIN
    -- Determine room_type based on agreement status
    IF NEW.status = 'active' THEN
        -- Check for overdue or pending payments
        SELECT 
            EXISTS(SELECT 1 FROM installments WHERE agreement_id = NEW.id AND status = 'overdue'),
            EXISTS(SELECT 1 FROM installments WHERE agreement_id = NEW.id AND status = 'pending'),
            EXISTS(SELECT 1 FROM installments WHERE agreement_id = NEW.id AND status = 'pending_confirmation')
        INTO v_has_overdue, v_has_pending_payment, v_has_pending_confirm;
        
        IF v_has_overdue OR v_has_pending_payment THEN
            v_room_type := 'debt';
            v_has_pending := true;
            v_pending_type := 'pay';
            v_pending_for := NEW.borrower_id;
        ELSIF v_has_pending_confirm THEN
            v_room_type := 'debt';
            v_has_pending := true;
            v_pending_type := 'confirm';
            v_pending_for := NEW.lender_id;
        ELSE
            v_room_type := 'agreement';
        END IF;
    ELSIF NEW.status = 'pending_confirmation' THEN
        v_room_type := 'agreement';
        v_has_pending := true;
        v_pending_type := 'confirm';
        v_pending_for := CASE WHEN NEW.borrower_confirmed THEN NEW.lender_id ELSE NEW.borrower_id END;
    ELSE
        v_room_type := 'agreement';
    END IF;
    
    -- Upsert chat_room
    INSERT INTO public.chat_rooms (
        agreement_id, room_type, has_pending_action, pending_action_type, 
        pending_action_for, user1_id, user2_id
    )
    VALUES (
        NEW.id, v_room_type, v_has_pending, v_pending_type,
        v_pending_for, NEW.lender_id, COALESCE(NEW.borrower_id, NEW.lender_id)
    )
    ON CONFLICT (agreement_id) DO UPDATE SET
        room_type = EXCLUDED.room_type,
        has_pending_action = EXCLUDED.has_pending_action,
        pending_action_type = EXCLUDED.pending_action_type,
        pending_action_for = EXCLUDED.pending_action_for,
        updated_at = now();
    
    RETURN NEW;
END;
$$;

-- 10. Trigger to sync chat room when agreement changes
CREATE TRIGGER sync_chat_room_on_agreement_change
AFTER INSERT OR UPDATE ON public.debt_agreements
FOR EACH ROW
EXECUTE FUNCTION public.sync_chat_room_from_agreement();

-- 11. Create function to sync chat room from installment changes
CREATE OR REPLACE FUNCTION public.sync_chat_room_from_installment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_agreement RECORD;
    v_has_overdue BOOLEAN;
    v_has_pending_payment BOOLEAN;
    v_has_pending_confirm BOOLEAN;
    v_room_type chat_room_type;
    v_has_pending BOOLEAN := false;
    v_pending_type pending_action_type := 'none';
    v_pending_for UUID;
BEGIN
    -- Get agreement info
    SELECT * INTO v_agreement FROM debt_agreements WHERE id = NEW.agreement_id;
    
    IF v_agreement IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Check installment statuses
    SELECT 
        EXISTS(SELECT 1 FROM installments WHERE agreement_id = NEW.agreement_id AND status = 'overdue'),
        EXISTS(SELECT 1 FROM installments WHERE agreement_id = NEW.agreement_id AND status = 'pending'),
        EXISTS(SELECT 1 FROM installments WHERE agreement_id = NEW.agreement_id AND status = 'pending_confirmation')
    INTO v_has_overdue, v_has_pending_payment, v_has_pending_confirm;
    
    IF v_has_overdue OR v_has_pending_payment THEN
        v_room_type := 'debt';
        v_has_pending := true;
        v_pending_type := 'pay';
        v_pending_for := v_agreement.borrower_id;
    ELSIF v_has_pending_confirm THEN
        v_room_type := 'debt';
        v_has_pending := true;
        v_pending_type := 'confirm';
        v_pending_for := v_agreement.lender_id;
    ELSE
        v_room_type := 'agreement';
        v_has_pending := false;
        v_pending_type := 'none';
        v_pending_for := NULL;
    END IF;
    
    -- Update chat_room
    UPDATE public.chat_rooms
    SET 
        room_type = v_room_type,
        has_pending_action = v_has_pending,
        pending_action_type = v_pending_type,
        pending_action_for = v_pending_for,
        updated_at = now()
    WHERE agreement_id = NEW.agreement_id;
    
    RETURN NEW;
END;
$$;

-- 12. Trigger to sync on installment changes
CREATE TRIGGER sync_chat_room_on_installment_change
AFTER INSERT OR UPDATE ON public.installments
FOR EACH ROW
EXECUTE FUNCTION public.sync_chat_room_from_installment();

-- 13. Create function to sync direct chat rooms
CREATE OR REPLACE FUNCTION public.sync_chat_room_from_direct_chat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.chat_rooms (
        direct_chat_id, room_type, user1_id, user2_id
    )
    VALUES (
        NEW.id, 'casual', NEW.user1_id, NEW.user2_id
    )
    ON CONFLICT (direct_chat_id) DO NOTHING;
    
    RETURN NEW;
END;
$$;

-- 14. Trigger for direct chat creation
CREATE TRIGGER sync_chat_room_on_direct_chat_create
AFTER INSERT ON public.direct_chats
FOR EACH ROW
EXECUTE FUNCTION public.sync_chat_room_from_direct_chat();

-- 15. Function to update last_message in chat_room
CREATE OR REPLACE FUNCTION public.update_chat_room_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.agreement_id IS NOT NULL THEN
        UPDATE public.chat_rooms
        SET 
            last_message = LEFT(NEW.content, 100),
            last_message_at = NEW.created_at,
            updated_at = now()
        WHERE agreement_id = NEW.agreement_id;
    ELSIF NEW.direct_chat_id IS NOT NULL THEN
        UPDATE public.chat_rooms
        SET 
            last_message = LEFT(NEW.content, 100),
            last_message_at = NEW.created_at,
            updated_at = now()
        WHERE direct_chat_id = NEW.direct_chat_id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- 16. Trigger for message updates
CREATE TRIGGER update_chat_room_on_message
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.update_chat_room_last_message();

-- 17. Enable realtime for chat_rooms
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_rooms;

-- 18. Create index for performance
CREATE INDEX idx_chat_rooms_user1 ON public.chat_rooms(user1_id);
CREATE INDEX idx_chat_rooms_user2 ON public.chat_rooms(user2_id);
CREATE INDEX idx_chat_rooms_pending ON public.chat_rooms(has_pending_action) WHERE has_pending_action = true;
CREATE INDEX idx_notifications_priority ON public.notifications(priority);
CREATE INDEX idx_notifications_user_priority ON public.notifications(user_id, priority, is_read);