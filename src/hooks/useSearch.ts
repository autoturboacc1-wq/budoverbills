import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface SearchResult {
  id: string;
  type: "agreement" | "friend";
  name: string;
  subtitle: string;
  status?: string;
}

interface AgreementSearchRow {
  id: string;
  borrower_name: string | null;
  principal_amount: number;
  total_amount: number;
  status: string;
}

interface FriendSearchRow {
  id: string;
  friend_name: string | null;
  nickname: string | null;
  friend_phone: string | null;
}

export function useSearch(query: string) {
  const { user } = useAuth();
  const [agreements, setAgreements] = useState<AgreementSearchRow[]>([]);
  const [friends, setFriends] = useState<FriendSearchRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch data once
  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [agreementsRes, friendsRes] = await Promise.all([
          // Use secure view that hides borrower info until confirmed
          supabase
            .from("debt_agreements_secure")
            .select("id, borrower_name, principal_amount, total_amount, status")
            .or(`lender_id.eq.${user.id},borrower_id.eq.${user.id}`),
          supabase
            .from("friends")
            .select("id, friend_name, nickname, friend_phone")
            .eq("user_id", user.id),
        ]);

        if (agreementsRes.data) setAgreements(agreementsRes.data as AgreementSearchRow[]);
        if (friendsRes.data) setFriends(friendsRes.data as FriendSearchRow[]);
      } catch (error) {
        console.error("Error fetching search data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  // Filter results based on query
  const results = useMemo<SearchResult[]>(() => {
    if (!query.trim()) return [];

    const normalizedQuery = query.toLowerCase().trim();
    const searchResults: SearchResult[] = [];

    // Search agreements
    agreements.forEach((agreement) => {
      const name = agreement.borrower_name || "";
      if (name.toLowerCase().includes(normalizedQuery)) {
        searchResults.push({
          id: agreement.id,
          type: "agreement",
          name,
          subtitle: `฿${new Intl.NumberFormat("th-TH").format(agreement.principal_amount)}`,
          status: agreement.status,
        });
      }
    });

    // Search friends
    friends.forEach((friend) => {
      const name = friend.friend_name || "";
      const nickname = friend.nickname || "";
      if (
        name.toLowerCase().includes(normalizedQuery) ||
        nickname.toLowerCase().includes(normalizedQuery)
      ) {
        searchResults.push({
          id: friend.id,
          type: "friend",
          name: nickname || name,
          subtitle: friend.friend_phone || "ไม่มีเบอร์โทร",
        });
      }
    });

    return searchResults.slice(0, 10);
  }, [query, agreements, friends]);

  return { results, loading };
}
