import { useState, useEffect, useCallback } from 'react';

export interface Friend {
  id: string;
  name: string;
  phone?: string;
  avatar?: string;
  addedAt: string;
}

const STORAGE_KEY = 'paymate-friends';

export function useFriends() {
  const [friends, setFriends] = useState<Friend[]>([]);

  // Load friends from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setFriends(JSON.parse(stored));
      } catch (e) {
        console.error('Error loading friends:', e);
      }
    }
  }, []);

  // Save friends to localStorage
  const saveFriends = useCallback((updatedFriends: Friend[]) => {
    setFriends(updatedFriends);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedFriends));
  }, []);

  const addFriend = useCallback((friend: Omit<Friend, 'id' | 'addedAt'>) => {
    const newFriend: Friend = {
      ...friend,
      id: `friend-${Date.now()}`,
      addedAt: new Date().toISOString(),
    };
    saveFriends([...friends, newFriend]);
    return newFriend;
  }, [friends, saveFriends]);

  const removeFriend = useCallback((friendId: string) => {
    saveFriends(friends.filter(f => f.id !== friendId));
  }, [friends, saveFriends]);

  const updateFriend = useCallback((friendId: string, updates: Partial<Omit<Friend, 'id' | 'addedAt'>>) => {
    saveFriends(friends.map(f => 
      f.id === friendId ? { ...f, ...updates } : f
    ));
  }, [friends, saveFriends]);

  const getFriend = useCallback((friendId: string) => {
    return friends.find(f => f.id === friendId);
  }, [friends]);

  const searchFriends = useCallback((query: string) => {
    const lowerQuery = query.toLowerCase();
    return friends.filter(f => 
      f.name.toLowerCase().includes(lowerQuery) ||
      f.phone?.includes(query)
    );
  }, [friends]);

  return {
    friends,
    addFriend,
    removeFriend,
    updateFriend,
    getFriend,
    searchFriends,
  };
}
