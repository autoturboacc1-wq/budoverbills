import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, UserCog, Search, Crown, User, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/contexts/AuthContext";
import type { AppRole } from "@/hooks/useUserRole";
import { AdminLayout } from "@/components/admin/AdminLayout";

interface UserWithRoles {
  user_id: string;
  display_name: string | null;
  roles: AppRole[];
}

export default function AdminUsersPage() {
  const { isAdmin } = useUserRole();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchCode, setSearchCode] = useState("");
  const [selectedRole, setSelectedRole] = useState<AppRole>("moderator");
  const [foundUser, setFoundUser] = useState<{ user_id: string; display_name: string | null; user_code: string } | null>(null);

  const createNotification = async (userId: string, action: "granted" | "revoked", role: AppRole) => {
    const title = action === "granted" ? `ได้รับสิทธิ์ ${role}` : `ถูกถอดสิทธิ์ ${role}`;
    const message = action === "granted" 
      ? `คุณได้รับการแต่งตั้งเป็น ${role === "admin" ? "Admin" : "Moderator"} แล้ว`
      : `สิทธิ์ ${role === "admin" ? "Admin" : "Moderator"} ของคุณถูกถอดแล้ว`;

    await supabase.rpc("create_notification", {
      p_user_id: userId,
      p_type: "role_change",
      p_title: title,
      p_message: message,
      p_related_type: "user_role"
    });
  };

  const logRoleActivity = async (targetUserId: string, action: "role_granted" | "role_revoked", role: AppRole) => {
    if (!user) return;
    
    await supabase.rpc("log_activity", {
      p_user_id: user.id,
      p_action_type: action,
      p_action_category: "admin",
      p_metadata: {
        target_user_id: targetUserId,
        role: role
      }
    });
  };

  const { data: usersWithRoles = [], isLoading } = useQuery({
    queryKey: ["admin-user-roles"],
    queryFn: async () => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id, role");
      
      if (error) throw error;

      const userRolesMap = new Map<string, AppRole[]>();
      roles?.forEach(r => {
        const existing = userRolesMap.get(r.user_id) || [];
        existing.push(r.role as AppRole);
        userRolesMap.set(r.user_id, existing);
      });

      const userIds = Array.from(userRolesMap.keys());
      if (userIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", userIds);

      const result: UserWithRoles[] = userIds.map(userId => ({
        user_id: userId,
        display_name: profiles?.find(p => p.user_id === userId)?.display_name || null,
        roles: userRolesMap.get(userId) || []
      }));

      return result;
    },
    enabled: isAdmin
  });

  const searchUser = async () => {
    if (!searchCode.trim()) {
      toast.error("กรุณากรอกรหัสผู้ใช้");
      return;
    }

    const { data, error } = await supabase.rpc("search_profile_by_code", {
      search_code: searchCode.toUpperCase()
    });

    if (error) {
      toast.error("เกิดข้อผิดพลาด");
      return;
    }

    if (data && data.length > 0) {
      setFoundUser(data[0]);
      toast.success("พบผู้ใช้");
    } else {
      toast.error("ไม่พบผู้ใช้ที่มีรหัสนี้");
      setFoundUser(null);
    }
  };

  const addRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { data, error } = await supabase.rpc("grant_user_role", {
        p_user_id: userId,
        p_role: role,
      }) as { data: { success?: boolean; error?: string; message?: string } | null; error: Error | null };

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.message || data?.error || "ไม่สามารถเพิ่มสิทธิ์ได้");
      }
      
      await createNotification(userId, "granted", role);
      await logRoleActivity(userId, "role_granted", role);
    },
    onSuccess: () => {
      toast.success("เพิ่มสิทธิ์สำเร็จ");
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
      setFoundUser(null);
      setSearchCode("");
    },
    onError: (error: Error) => {
      if (error.message.includes("duplicate") || error.message.includes("มีสิทธิ์นี้อยู่แล้ว")) {
        toast.error("ผู้ใช้มีสิทธิ์นี้อยู่แล้ว");
      } else {
        toast.error("เกิดข้อผิดพลาด");
      }
    }
  });

  const removeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { data, error } = await supabase.rpc("revoke_user_role", {
        p_user_id: userId,
        p_role: role,
      }) as { data: { success?: boolean; error?: string; message?: string } | null; error: Error | null };

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.message || data?.error || "ไม่สามารถถอดสิทธิ์ได้");
      }
      
      await createNotification(userId, "revoked", role);
      await logRoleActivity(userId, "role_revoked", role);
    },
    onSuccess: () => {
      toast.success("ถอดสิทธิ์สำเร็จ");
      queryClient.invalidateQueries({ queryKey: ["admin-user-roles"] });
    },
    onError: (error: Error) => {
      if (error.message.includes("Admin อย่างน้อย 1 คน")) {
        toast.error("ต้องมี Admin อย่างน้อย 1 คน");
      } else if (error.message.includes("ตัวเอง")) {
        toast.error("ไม่สามารถถอดสิทธิ์ Admin ของตัวเองได้");
      } else if (error.message.includes("มีสิทธิ์นี้อยู่แล้ว")) {
        toast.error("ผู้ใช้มีสิทธิ์นี้อยู่แล้ว");
      } else {
        toast.error(error.message || "เกิดข้อผิดพลาด");
      }
    }
  });

  const getRoleIcon = (role: AppRole) => {
    switch (role) {
      case "admin":
        return <Crown className="w-4 h-4 text-yellow-500" />;
      case "moderator":
        return <Shield className="w-4 h-4 text-blue-500" />;
      default:
        return <User className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getRoleBadgeVariant = (role: AppRole) => {
    switch (role) {
      case "admin":
        return "destructive";
      case "moderator":
        return "default";
      default:
        return "secondary";
    }
  };

  return (
    <AdminLayout requireAdmin>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-500/10 rounded-lg">
            <UserCog className="h-6 w-6 text-purple-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">จัดการสิทธิ์ผู้ใช้</h1>
            <p className="text-sm text-muted-foreground">แต่งตั้ง/ถอด Admin และ Moderator</p>
          </div>
        </div>

        {/* Add Role Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="w-5 h-5" />
                เพิ่มสิทธิ์ผู้ใช้
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="รหัสผู้ใช้ (User Code)"
                  value={searchCode}
                  onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
                  className="flex-1"
                />
                <Button onClick={searchUser} variant="outline">
                  <Search className="w-4 h-4" />
                </Button>
              </div>

              {foundUser && (
                <div className="p-4 bg-secondary/50 rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{foundUser.display_name || "ไม่ระบุชื่อ"}</p>
                      <p className="text-xs text-muted-foreground">Code: {foundUser.user_code}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="moderator">Moderator</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      onClick={() => addRoleMutation.mutate({ userId: foundUser.user_id, role: selectedRole })}
                      disabled={addRoleMutation.isPending}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      เพิ่มสิทธิ์
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Users with Roles */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5" />
                ผู้ใช้ที่มีสิทธิ์พิเศษ ({usersWithRoles.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                </div>
              ) : usersWithRoles.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">ยังไม่มีผู้ใช้ที่มีสิทธิ์พิเศษ</p>
              ) : (
                <div className="space-y-3">
                  {usersWithRoles.map((u) => (
                    <div 
                      key={u.user_id} 
                      className="p-4 bg-secondary/30 rounded-lg flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium">{u.display_name || "ไม่ระบุชื่อ"}</p>
                        <p className="text-xs text-muted-foreground font-mono">{u.user_id.slice(0, 8)}...</p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {u.roles.map((role) => (
                          <div key={role} className="flex items-center gap-1">
                            <Badge variant={getRoleBadgeVariant(role)} className="flex items-center gap-1">
                              {getRoleIcon(role)}
                              {role}
                            </Badge>
                            <button
                              onClick={() => removeRoleMutation.mutate({ userId: u.user_id, role })}
                              className="p-1 hover:bg-destructive/20 rounded transition-colors"
                              disabled={removeRoleMutation.isPending}
                            >
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </AdminLayout>
  );
}
