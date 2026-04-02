import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCallback } from 'react';
import type { Json } from '@/integrations/supabase/types';

export type ActionCategory = 
  | 'auth'
  | 'agreement'
  | 'payment'
  | 'profile'
  | 'social'
  | 'admin'
  | 'general';

export type ActionType =
  // Auth actions
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'signup'
  | 'password_reset'
  // Agreement actions
  | 'agreement_created'
  | 'agreement_confirmed'
  | 'agreement_cancelled'
  // Payment actions
  | 'payment_uploaded'
  | 'payment_confirmed'
  | 'payment_rejected'
  | 'reschedule_requested'
  | 'reschedule_approved'
  | 'reschedule_rejected'
  // Profile actions
  | 'profile_updated'
  | 'profile_viewed'
  // Social actions
  | 'friend_request_sent'
  | 'friend_request_accepted'
  | 'post_liked'
  | 'comment_added'
  // General
  | 'suspicious_activity';

interface LogActivityParams {
  actionType: ActionType;
  actionCategory?: ActionCategory;
  metadata?: Record<string, Json>;
  isSuspicious?: boolean;
  userId?: string; // Optional override for unauthenticated actions
}

export function useActivityLogger() {
  const { user } = useAuth();

  const logActivity = useCallback(async ({
    actionType,
    actionCategory = 'general',
    metadata = {},
    isSuspicious = false,
    userId
  }: LogActivityParams): Promise<string | null> => {
    try {
      const rpcUserId = (userId || user?.id || null) as unknown as string;
      const { data, error } = await supabase.rpc('log_activity', {
        p_user_id: rpcUserId,
        p_action_type: actionType,
        p_action_category: actionCategory,
        p_metadata: metadata as Json,
        p_is_suspicious: isSuspicious
      });

      if (error) {
        console.error('Failed to log activity:', error);
        return null;
      }

      return data;
    } catch (err) {
      console.error('Activity logging error:', err);
      return null;
    }
  }, [user?.id]);

  const logLoginSuccess = useCallback((metadata?: Record<string, Json>) => {
    return logActivity({
      actionType: 'login_success',
      actionCategory: 'auth',
      metadata
    });
  }, [logActivity]);

  const logLoginFailed = useCallback((email: string, reason?: string) => {
    return logActivity({
      actionType: 'login_failed',
      actionCategory: 'auth',
      metadata: { email, reason: reason || null },
      isSuspicious: true
    });
  }, [logActivity]);

  const logLogout = useCallback(() => {
    return logActivity({
      actionType: 'logout',
      actionCategory: 'auth'
    });
  }, [logActivity]);

  const logSignup = useCallback((metadata?: Record<string, Json>) => {
    return logActivity({
      actionType: 'signup',
      actionCategory: 'auth',
      metadata
    });
  }, [logActivity]);

  const logAgreementCreated = useCallback((agreementId: string) => {
    return logActivity({
      actionType: 'agreement_created',
      actionCategory: 'agreement',
      metadata: { agreement_id: agreementId }
    });
  }, [logActivity]);

  const logAgreementConfirmed = useCallback((agreementId: string, role: 'lender' | 'borrower') => {
    return logActivity({
      actionType: 'agreement_confirmed',
      actionCategory: 'agreement',
      metadata: { agreement_id: agreementId, role }
    });
  }, [logActivity]);

  const logPaymentUploaded = useCallback((installmentId: string, agreementId: string) => {
    return logActivity({
      actionType: 'payment_uploaded',
      actionCategory: 'payment',
      metadata: { installment_id: installmentId, agreement_id: agreementId }
    });
  }, [logActivity]);

  const logPaymentConfirmed = useCallback((installmentId: string, agreementId: string) => {
    return logActivity({
      actionType: 'payment_confirmed',
      actionCategory: 'payment',
      metadata: { installment_id: installmentId, agreement_id: agreementId }
    });
  }, [logActivity]);

  const logRescheduleRequested = useCallback((installmentId: string, agreementId: string) => {
    return logActivity({
      actionType: 'reschedule_requested',
      actionCategory: 'payment',
      metadata: { installment_id: installmentId, agreement_id: agreementId }
    });
  }, [logActivity]);

  const logProfileUpdated = useCallback((fields: string[]) => {
    return logActivity({
      actionType: 'profile_updated',
      actionCategory: 'profile',
      metadata: { updated_fields: fields }
    });
  }, [logActivity]);

  const logSuspiciousActivity = useCallback((details: Record<string, Json>) => {
    return logActivity({
      actionType: 'suspicious_activity',
      actionCategory: 'general',
      metadata: details,
      isSuspicious: true
    });
  }, [logActivity]);

  return {
    logActivity,
    logLoginSuccess,
    logLoginFailed,
    logLogout,
    logSignup,
    logAgreementCreated,
    logAgreementConfirmed,
    logPaymentUploaded,
    logPaymentConfirmed,
    logRescheduleRequested,
    logProfileUpdated,
    logSuspiciousActivity
  };
}

// Standalone function for logging without hook (e.g., in auth context)
export async function logActivityDirect(params: LogActivityParams & { userId?: string }): Promise<string | null> {
  try {
    const rpcUserId = (params.userId || null) as unknown as string;
    const { data, error } = await supabase.rpc('log_activity', {
      p_user_id: rpcUserId,
      p_action_type: params.actionType,
      p_action_category: params.actionCategory || 'general',
      p_metadata: (params.metadata || {}) as Json,
      p_is_suspicious: params.isSuspicious || false
    });

    if (error) {
      console.error('Failed to log activity:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Activity logging error:', err);
    return null;
  }
}
