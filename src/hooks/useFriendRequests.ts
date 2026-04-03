import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

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

export function useFriendRequests() {
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

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Realtime subscription for friend requests
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('friend-requests-changes')
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
      if (error instanceof Error && (error as { code?: string }).code === '23505') {
        toast.error('มีคำขอเป็นเพื่อนอยู่แล้ว');
      } else {
        toast.error('ไม่สามารถส่งคำขอได้');
      }
      return false;
    }
  };

  const acceptRequest = async (requestId: string) => {
    if (!userId) return false;
    const createdFriendIds: string[] = [];

    try {
      const { data: request, error: requestError } = await supabase
        .from('friend_requests')
        .select('*')
        .eq('id', requestId)
        .eq('to_user_id', userId)
        .eq('status', 'pending')
        .maybeSingle();

      if (requestError) throw requestError;

      if (!request) {
        toast.error('ไม่พบคำขอ');
        return false;
      }

      const [fromProfileResult, toProfileResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('display_name, user_code')
          .eq('user_id', request.from_user_id)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('display_name, user_code')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      if (fromProfileResult.error) throw fromProfileResult.error;
      if (toProfileResult.error) throw toProfileResult.error;

      const { data: friend1, error: friend1Error } = await supabase
        .from('friends')
        .insert({
          user_id: userId,
          friend_user_id: request.from_user_id,
          friend_name: fromProfileResult.data?.display_name || `User ${fromProfileResult.data?.user_code || 'Unknown'}`,
        })
        .select('id')
        .single();

      if (friend1Error) throw friend1Error;
      if (friend1?.id) {
        createdFriendIds.push(friend1.id);
      }

      const { data: friend2, error: friend2Error } = await supabase
        .from('friends')
        .insert({
          user_id: request.from_user_id,
          friend_user_id: userId,
          friend_name: toProfileResult.data?.display_name || `User ${toProfileResult.data?.user_code || 'Unknown'}`,
        })
        .select('id')
        .single();

      if (friend2Error) throw friend2Error;
      if (friend2?.id) {
        createdFriendIds.push(friend2.id);
      }

      const { error: updateError } = await supabase
        .from('friend_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId)
        .eq('to_user_id', userId)
        .eq('status', 'pending');

      if (updateError) throw updateError;

      await fetchRequests();
      toast.success('ยอมรับคำขอเป็นเพื่อนแล้ว');
      return true;
    } catch (error: unknown) {
      console.error('Error accepting friend request:', error);
      if (createdFriendIds.length > 0) {
        await supabase
          .from('friends')
          .delete()
          .in('id', createdFriendIds);
      }
      toast.error('ไม่สามารถยอมรับคำขอได้');
      return false;
    }
  };

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
