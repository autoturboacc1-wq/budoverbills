import { createContext, createElement, useState, useEffect, useCallback, useRef, useContext, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

type RpcClient = {
  rpc<TData>(functionName: string, args?: Record<string, unknown>): Promise<{
    data: TData | null;
    error: { message: string } | null;
  }>;
};

const rpcClient = supabase as unknown as RpcClient;

export interface FriendRequest {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
  // Joined profile data
  from_profile?: {
    display_name: string | null;
    user_code: string | null;
    avatar_url: string | null;
  };
  to_profile?: {
    display_name: string | null;
    user_code: string | null;
    avatar_url: string | null;
  };
}

interface FriendRequestsContextValue {
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  isLoading: boolean;
  sendRequest: (toUserId: string) => Promise<boolean>;
  acceptRequest: (requestId: string) => Promise<boolean>;
  rejectRequest: (requestId: string) => Promise<boolean>;
  cancelRequest: (requestId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  pendingCount: number;
}

const FriendRequestsContext = createContext<FriendRequestsContextValue | undefined>(undefined);

function useFriendRequestsState(): FriendRequestsContextValue {
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const requestIdRef = useRef(0);

  const clearRequests = useCallback(() => {
    setIncomingRequests([]);
    setOutgoingRequests([]);
  }, []);

  const fetchRequests = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!userId) {
      clearRequests();
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // Fetch incoming requests (where I'm the recipient)
      const { data: incoming, error: incomingError } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('to_user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (incomingError) throw incomingError;

      // Fetch outgoing requests (where I'm the sender)
      const { data: outgoing, error: outgoingError } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('from_user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (outgoingError) throw outgoingError;

      if (requestId !== requestIdRef.current) {
        return;
      }

      // Fetch profile data for incoming requests
      const incomingWithProfiles = await Promise.all(
        (incoming || []).map(async (req) => {
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('display_name, user_code, avatar_url')
            .eq('user_id', req.from_user_id)
            .maybeSingle();

          if (error) {
            console.error('Error fetching incoming request profile:', error);
          }

          return { ...req, from_profile: profile ?? undefined } as FriendRequest;
        })
      );

      // Fetch profile data for outgoing requests
      const outgoingWithProfiles = await Promise.all(
        (outgoing || []).map(async (req) => {
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('display_name, user_code, avatar_url')
            .eq('user_id', req.to_user_id)
            .maybeSingle();

          if (error) {
            console.error('Error fetching outgoing request profile:', error);
          }

          return { ...req, to_profile: profile ?? undefined } as FriendRequest;
        })
      );

      if (requestId !== requestIdRef.current) {
        return;
      }

      setIncomingRequests(incomingWithProfiles);
      setOutgoingRequests(outgoingWithProfiles);
    } catch (error: unknown) {
      console.error('Error fetching friend requests:', error);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [clearRequests, userId]);

  const acceptFriendRequest = useCallback(async (requestId: string): Promise<boolean> => {
    if (!userId) return false;

    try {
      const { data, error } = await rpcClient.rpc<{ success?: boolean }>('accept_friend_request', {
        p_request_id: requestId,
      });

      if (error) throw error;

      const result = data as { success?: boolean } | null;
      if (!result?.success) {
        throw new Error('ไม่สามารถยอมรับคำขอได้');
      }

      try {
        await rpcClient.rpc('earn_points', {
          p_user_id: userId,
          p_action_type: 'friend_added',
          p_reference_id: requestId,
          p_points: 50,
          p_description: 'ยอมรับคำขอเป็นเพื่อนสำเร็จ',
        });
      } catch (pointsError) {
        console.error('Error awarding friend request points:', pointsError);
      }

      await fetchRequests();
      toast.success('ยอมรับคำขอเป็นเพื่อนแล้ว');
      return true;
    } catch (error: unknown) {
      console.error('Error accepting friend request:', error);
      toast.error('ไม่สามารถยอมรับคำขอได้');
      return false;
    }
  }, [fetchRequests, userId]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Realtime subscription for friend requests
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`friend-requests-changes-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_requests',
          filter: `to_user_id=eq.${userId}`,
        },
        () => {
          fetchRequests();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'friend_requests',
          filter: `from_user_id=eq.${userId}`,
        },
        () => {
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchRequests, userId]);

  const sendRequest = async (toUserId: string) => {
    if (!userId) {
      toast.error('กรุณาเข้าสู่ระบบก่อน');
      return false;
    }

    if (toUserId === userId) {
      toast.error('ไม่สามารถเพิ่มตัวเองเป็นเพื่อนได้');
      return false;
    }

    try {
      // Check if request already exists (in either direction)
      const { data: existing } = await supabase
        .from('friend_requests')
        .select('id, status')
        .or(`and(from_user_id.eq.${userId},to_user_id.eq.${toUserId}),and(from_user_id.eq.${toUserId},to_user_id.eq.${userId})`)
        .maybeSingle();

      if (existing) {
        if (existing.status === 'pending') {
          toast.info('มีคำขอเป็นเพื่อนรอดำเนินการอยู่แล้ว');
        } else if (existing.status === 'accepted') {
          toast.info('คุณเป็นเพื่อนกันอยู่แล้ว');
        }
        return false;
      }

      // Check if already friends
      const { data: existingFriend } = await supabase
        .from('friends')
        .select('id')
        .eq('user_id', userId)
        .eq('friend_user_id', toUserId)
        .maybeSingle();

      if (existingFriend) {
        toast.info('ผู้ใช้นี้เป็นเพื่อนของคุณอยู่แล้ว');
        return false;
      }

      const { error } = await supabase
        .from('friend_requests')
        .insert({
          from_user_id: userId,
          to_user_id: toUserId,
        });

      if (error) throw error;

      await fetchRequests();
      toast.success('ส่งคำขอเป็นเพื่อนแล้ว');
      return true;
    } catch (error: unknown) {
      console.error('Error sending friend request:', error);
      // BUG-FRIEND-04: The DB has a UNIQUE constraint on (from_user_id, to_user_id) as the
      // authoritative duplicate guard. Supabase returns a PostgrestError (plain object, NOT
      // an Error instance) with code '23505' on a unique-constraint violation, so we check
      // the code directly without the instanceof guard.
      const pgCode = typeof error === 'object' && error !== null ? (error as { code?: string }).code : undefined;
      if (pgCode === '23505') {
        toast.error('มีคำขอเป็นเพื่อนอยู่แล้ว');
      } else {
        toast.error('ไม่สามารถส่งคำขอได้');
      }
      return false;
    }
  };

  const acceptRequest = acceptFriendRequest;

  const rejectRequest = async (requestId: string) => {
    try {
      if (!userId) return false;

      const { error } = await supabase
        .from('friend_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId)
        .eq('to_user_id', userId)
        .eq('status', 'pending');

      if (error) throw error;

      await fetchRequests();
      toast.success('ปฏิเสธคำขอแล้ว');
      return true;
    } catch (error: unknown) {
      console.error('Error rejecting friend request:', error);
      toast.error('ไม่สามารถปฏิเสธคำขอได้');
      return false;
    }
  };

  const cancelRequest = async (requestId: string) => {
    try {
      if (!userId) return false;

      const { error } = await supabase
        .from('friend_requests')
        .delete()
        .eq('id', requestId)
        .eq('from_user_id', userId)
        .eq('status', 'pending');

      if (error) throw error;

      await fetchRequests();
      toast.success('ยกเลิกคำขอแล้ว');
      return true;
    } catch (error: unknown) {
      console.error('Error canceling friend request:', error);
      toast.error('ไม่สามารถยกเลิกคำขอได้');
      return false;
    }
  };

  return {
    incomingRequests,
    outgoingRequests,
    isLoading,
    sendRequest,
    acceptRequest,
    rejectRequest,
    cancelRequest,
    refresh: fetchRequests,
    pendingCount: incomingRequests.length,
  };
}

export function FriendRequestsProvider({ children }: { children: ReactNode }) {
  const value = useFriendRequestsState();

  return createElement(FriendRequestsContext.Provider, { value }, children);
}

export function useFriendRequests() {
  const context = useContext(FriendRequestsContext);

  if (!context) {
    throw new Error('useFriendRequests must be used within a FriendRequestsProvider');
  }

  return context;
}
