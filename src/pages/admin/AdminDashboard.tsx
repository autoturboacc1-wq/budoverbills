import { useState } from "react";
import { motion } from "framer-motion";
import { 
  Shield, 
  UserCog, 
  Activity, 
  Crown, 
  Clock, 
  UserPlus, 
  UserMinus, 
  Filter,
  TrendingUp,
  Users,
  FileText
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, subMonths, startOfDay } from "date-fns";
import { th } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminLayout } from "@/components/admin/AdminLayout";

type ActionFilter = "all" | "role_granted" | "role_revoked";
type TimeFilter = "all" | "today" | "7days" | "30days";

const quickActions = [
  {
    title: "Security Dashboard",
    description: "ตรวจสอบกิจกรรมที่น่าสงสัย",
    icon: Shield,
    path: "/admin/security",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
    requiredRole: "admin" as const
  },
  {
    title: "จัดการสิทธิ์ผู้ใช้",
    description: "แต่งตั้ง/ถอดสิทธิ์ Admin และ Moderator",
    icon: UserCog,
    path: "/admin/users",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    requiredRole: "admin" as const
  }
];

interface AuditLogEntry {
  id: string;
  user_id: string;
  action_type: string;
  metadata: {
    target_user_id?: string;
    role?: string;
  };
  created_at: string;
  actor_name?: string;
  target_name?: string;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");

  // Quick stats
  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [agreementsRes, usersRes, activityRes] = await Promise.all([
        supabase.from("debt_agreements").select("id", { count: "exact" }),
        supabase.from("profiles").select("id", { count: "exact" }),
        supabase.from("activity_logs").select("id", { count: "exact" }).gte("created_at", subDays(new Date(), 1).toISOString())
      ]);

      return {
        totalAgreements: agreementsRes.count || 0,
        totalUsers: usersRes.count || 0,
        dailyActivity: activityRes.count || 0
      };
    }
  });

  // Fetch audit trail for role changes
  const { data: auditLogs = [], isLoading: auditLoading } = useQuery({
    queryKey: ["admin-audit-trail", actionFilter, timeFilter],
    queryFn: async () => {
      let query = supabase
        .from("activity_logs")
        .select("id, user_id, action_type, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (actionFilter === "all") {
        query = query.in("action_type", ["role_granted", "role_revoked"]);
      } else {
        query = query.eq("action_type", actionFilter);
      }

      if (timeFilter !== "all") {
        let fromDate: Date;
        if (timeFilter === "today") {
          fromDate = startOfDay(new Date());
        } else if (timeFilter === "7days") {
          fromDate = subDays(new Date(), 7);
        } else {
          fromDate = subMonths(new Date(), 1);
        }
        query = query.gte("created_at", fromDate.toISOString());
      }

      const { data: logs, error } = await query;
      if (error) throw error;

      const userIds = new Set<string>();
      logs?.forEach(log => {
        if (log.user_id) {
          userIds.add(log.user_id);
        }
        const metadata = log.metadata as { target_user_id?: string };
        if (metadata?.target_user_id) {
          userIds.add(metadata.target_user_id);
        }
      });

      if (userIds.size === 0) return [];
      
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", Array.from(userIds));

      const profileMap = new Map(profiles?.map(p => [p.user_id, p.display_name]) || []);

      return (logs || []).map(log => {
        const metadata = log.metadata as { target_user_id?: string; role?: string };
        return {
          ...log,
          metadata,
          actor_name: log.user_id ? profileMap.get(log.user_id) || "Unknown" : "Unknown",
          target_name: metadata?.target_user_id 
            ? profileMap.get(metadata.target_user_id) || "Unknown"
            : "Unknown"
        } as AuditLogEntry;
      });
    },
    enabled: isAdmin
  });

  const visibleActions = quickActions.filter(action => {
    if (action.requiredRole === "admin") return isAdmin;
    return true;
  });

  const formatRole = (role?: string) => {
    if (role === "admin") return "Admin";
    if (role === "moderator") return "Moderator";
    return role || "Unknown";
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">ภาพรวมการจัดการระบบ</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-blue-500/10">
                    <FileText className="w-6 h-6 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.totalAgreements || 0}</p>
                    <p className="text-sm text-muted-foreground">ข้อตกลงทั้งหมด</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-green-500/10">
                    <Users className="w-6 h-6 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.totalUsers || 0}</p>
                    <p className="text-sm text-muted-foreground">ผู้ใช้ทั้งหมด</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-orange-500/10">
                    <TrendingUp className="w-6 h-6 text-orange-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.dailyActivity || 0}</p>
                    <p className="text-sm text-muted-foreground">กิจกรรมวันนี้</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold mb-4">การดำเนินการด่วน</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {visibleActions.map((action, index) => {
              const Icon = action.icon;
              return (
                <motion.div
                  key={action.path}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card 
                    className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02]"
                    onClick={() => navigate(action.path)}
                  >
                    <CardHeader className="flex flex-row items-center gap-4 pb-2">
                      <div className={`p-3 rounded-xl ${action.bgColor}`}>
                        <Icon className={`w-6 h-6 ${action.color}`} />
                      </div>
                      <div className="flex-1">
                        <CardTitle className="text-base">{action.title}</CardTitle>
                        <CardDescription className="text-xs">{action.description}</CardDescription>
                      </div>
                    </CardHeader>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* System Status */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="w-5 h-5" />
              สถานะระบบ
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="text-2xl font-bold text-primary">🟢</p>
                <p className="text-sm text-muted-foreground">ระบบปกติ</p>
              </div>
              <div className="p-3 bg-secondary/30 rounded-lg">
                <p className="text-2xl font-bold">{isAdmin ? "Admin" : "Mod"}</p>
                <p className="text-sm text-muted-foreground">สิทธิ์ของคุณ</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Audit Trail - Only for Admin */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5" />
                ประวัติการเปลี่ยนแปลงสิทธิ์
              </CardTitle>
              <CardDescription>Audit Trail - {auditLogs.length} รายการ</CardDescription>
              
              <div className="flex flex-wrap gap-2 mt-3">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as ActionFilter)}>
                    <SelectTrigger className="w-[130px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">ทั้งหมด</SelectItem>
                      <SelectItem value="role_granted">แต่งตั้ง</SelectItem>
                      <SelectItem value="role_revoked">ถอดสิทธิ์</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
                  <SelectTrigger className="w-[130px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทุกช่วงเวลา</SelectItem>
                    <SelectItem value="today">วันนี้</SelectItem>
                    <SelectItem value="7days">7 วันที่ผ่านมา</SelectItem>
                    <SelectItem value="30days">30 วันที่ผ่านมา</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {auditLoading ? (
                <div className="text-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                </div>
              ) : auditLogs.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">ยังไม่มีประวัติการเปลี่ยนแปลง</p>
              ) : (
                <ScrollArea className="h-[300px] pr-4">
                  <div className="space-y-3">
                    {auditLogs.map((log) => {
                      const isGranted = log.action_type === "role_granted";
                      return (
                        <div 
                          key={log.id} 
                          className={`p-3 rounded-lg border ${
                            isGranted 
                              ? "bg-green-500/5 border-green-500/20" 
                              : "bg-red-500/5 border-red-500/20"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-full ${
                              isGranted ? "bg-green-500/20" : "bg-red-500/20"
                            }`}>
                              {isGranted ? (
                                <UserPlus className={`w-4 h-4 text-green-600`} />
                              ) : (
                                <UserMinus className="w-4 h-4 text-red-600" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{log.actor_name}</span>
                                <span className="text-muted-foreground text-xs">
                                  {isGranted ? "แต่งตั้ง" : "ถอดสิทธิ์"}
                                </span>
                                <span className="font-medium text-sm">{log.target_name}</span>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                  log.metadata?.role === "admin" 
                                    ? "bg-yellow-500/20 text-yellow-600" 
                                    : "bg-blue-500/20 text-blue-600"
                                }`}>
                                  <Crown className="w-3 h-3" />
                                  {formatRole(log.metadata?.role)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(log.created_at), "d MMM yyyy HH:mm", { locale: th })}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
