import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface DbFriend {
  id: string;
  user_id: string;
  friend_user_id: string | null;
  friend_name: string;
  friend_phone: string | null;
  nickname: string | null;
  created_at: string;
}

export function useDbFriends() {
  const [friends, setFriends] = useState<DbFriend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const fetchFriends = useCallback(async () => {
    if (!user) {
      setFriends([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('friends')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFriends(data || []);
    } catch (error: unknown) {
      console.error('Error fetching friends:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  const addFriend = async (input: { 
    name: string; 
    phone?: string; 
    friend_user_id?: string;
    nickname?: string;
  }) => {
    if (!user) {
      toast.error('กรุณาเข้าสู่ระบบก่อน');
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('friends')
        .insert({
          user_id: user.id,
          friend_name: input.name,
          friend_phone: input.phone || null,
          friend_user_id: input.friend_user_id || null,
          nickname: input.nickname || null,
        })
        .select()
        .single();

      if (error) throw error;
      await fetchFriends();
      toast.success('เพิ่มเพื่อนเรียบร้อย');
      return data;
    } catch (error: unknown) {
      console.error('Error adding friend:', error);
      toast.error('ไม่สามารถเพิ่มเพื่อนได้');
      return null;
    }
  };

  const removeFriend = async (friendId: string) => {
    try {
      const { error } = await supabase
        .from('friends')
        .delete()
        .eq('id', friendId);

      if (error) throw error;
      await fetchFriends();
      toast.success('ลบเพื่อนเรียบร้อย');
      return true;
    } catch (error: unknown) {
      console.error('Error removing friend:', error);
      toast.error('ไม่สามารถลบเพื่อนได้');
      return false;
    }
  };

  const updateFriend = async (friendId: string, updates: {
    friend_name?: string;
    friend_phone?: string;
    nickname?: string;
  }) => {
    try {
      const { error } = await supabase
        .from('friends')
        .update(updates)
        .eq('id', friendId);

      if (error) throw error;
      await fetchFriends();
      return true;
    } catch (error: unknown) {
      console.error('Error updating friend:', error);
      toast.error('ไม่สามารถอัปเดตได้');
      return false;
    }
  };

  const searchFriends = useCallback((query: string) => {
    const lowerQuery = query.toLowerCase();
    return friends.filter(f => 
      f.friend_name.toLowerCase().includes(lowerQuery) ||
      f.nickname?.toLowerCase().includes(lowerQuery) ||
      f.friend_phone?.includes(query)
    );
  }, [friends]);

  const getFriend = useCallback((friendId: string) => {
    return friends.find(f => f.id === friendId);
  }, [friends]);

  return {
    friends,
    isLoading,
    addFriend,
    removeFriend,
    updateFriend,
    searchFriends,
    getFriend,
    refresh: fetchFriends,
  };
}
