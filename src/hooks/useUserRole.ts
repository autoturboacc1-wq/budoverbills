import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type AppRole = "admin" | "moderator" | "user";

export function useUserRole() {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const requestIdRef = useRef(0);

  const fetchRoles = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    if (!userId) {
      setRoles([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (error) throw error;

      if (requestId !== requestIdRef.current) {
        return;
      }

      setRoles((data || []).map(r => r.role as AppRole));
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      console.error("Error fetching user roles:", error);
      setRoles([]);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  const isAdmin = roles.includes("admin");
  const isModerator = roles.includes("moderator") || isAdmin;

  return { roles, loading, isAdmin, isModerator, refetch: fetchRoles };
}
