import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { BottomNav } from '@/components/BottomNav';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Shield, 
  AlertTriangle, 
  Activity, 
  Users, 
  Clock,
  RefreshCw,
  ChevronRight,
  Eye
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { th } from 'date-fns/locale';

interface ActivityLog {
  id: string;
  user_id: string | null;
  action_type: string;
  action_category: string;
  metadata: Record<string, unknown>;
  is_suspicious: boolean;
  created_at: string;
}

interface SuspiciousSummary {
  user_id: string;
  action_type: string;
  action_count: number;
  last_occurrence: string;
}

export default function AdminSecurity() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [activeTab, setActiveTab] = useState('suspicious');
  const [suspiciousLogs, setSuspiciousLogs] = useState<ActivityLog[]>([]);
  const [allLogs, setAllLogs] = useState<ActivityLog[]>([]);
  const [summary, setSummary] = useState<SuspiciousSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      navigate('/');
    }
  }, [isAdmin, roleLoading, navigate]);

  useEffect(() => {
    if (roleLoading || !user || !isAdmin) {
      return;
    }

    const verified = sessionStorage.getItem('admin_verified');
    if (verified !== user.id) {
      navigate('/admin/login', { replace: true });
    }
  }, [isAdmin, roleLoading, navigate, user]);

  const fetchLogs = useCallback(async () => {
    if (!isAdmin || sessionStorage.getItem('admin_verified') !== user?.id) return;
    
    setLoading(true);
    try {
      // Fetch suspicious logs
      const { data: suspicious, error: suspiciousError } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('is_suspicious', true)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (!suspiciousError && suspicious) {
        setSuspiciousLogs(suspicious as ActivityLog[]);
      }

      // Fetch all recent logs
      const { data: all, error: allError } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (!allError && all) {
        setAllLogs(all as ActivityLog[]);
      }

      // Fetch suspicious summary
      const { data: summaryData, error: summaryError } = await supabase
        .rpc('get_suspicious_activities', { p_hours: 24 });
      
      if (!summaryError && summaryData) {
        setSummary(summaryData as SuspiciousSummary[]);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user?.id]);

  useEffect(() => {
    if (isAdmin) {
      void fetchLogs();
    }
  }, [fetchLogs, isAdmin]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchLogs();
    setRefreshing(false);
  };

  const getActionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      login_success: 'เข้าสู่ระบบสำเร็จ',
      login_failed: 'เข้าสู่ระบบล้มเหลว',
      logout: 'ออกจากระบบ',
      signup: 'สมัครสมาชิก',
      password_reset: 'รีเซ็ตรหัสผ่าน',
      agreement_created: 'สร้างสัญญา',
      agreement_confirmed: 'ยืนยันสัญญา',
      payment_uploaded: 'อัปโหลดสลิป',
      payment_confirmed: 'ยืนยันการชำระ',
      suspicious_activity: 'กิจกรรมต้องสงสัย'
    };
    return labels[type] || type;
  };

  const getCategoryBadgeVariant = (category: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (category) {
      case 'auth': return 'default';
      case 'agreement': return 'secondary';
      case 'payment': return 'outline';
      default: return 'secondary';
    }
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header userName="Admin" />
        <main className="container mx-auto px-4 pt-20 pb-24">
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  const suspiciousCount = suspiciousLogs.length;
  const last24hCount = allLogs.filter(log => {
    const logTime = new Date(log.created_at);
    const now = new Date();
    return (now.getTime() - logTime.getTime()) < 24 * 60 * 60 * 1000;
  }).length;

  return (
    <div className="min-h-screen bg-background">
      <Header userName="Admin" />
      <main className="container mx-auto px-4 pt-20 pb-24">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/10 rounded-lg">
                <Shield className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Security Dashboard</h1>
                <p className="text-sm text-muted-foreground">ตรวจสอบกิจกรรมและพฤติกรรมผิดปกติ</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              รีเฟรช
            </Button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <div>
                    <p className="text-2xl font-bold">{suspiciousCount}</p>
                    <p className="text-xs text-muted-foreground">กิจกรรมต้องสงสัย</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-2xl font-bold">{last24hCount}</p>
                    <p className="text-xs text-muted-foreground">กิจกรรม 24 ชม.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-secondary-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{summary.length}</p>
                    <p className="text-xs text-muted-foreground">ผู้ใช้ต้องสงสัย</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-2xl font-bold">{allLogs.length}</p>
                    <p className="text-xs text-muted-foreground">Logs ทั้งหมด</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="suspicious" className="flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                ต้องสงสัย
              </TabsTrigger>
              <TabsTrigger value="summary" className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                สรุป
              </TabsTrigger>
              <TabsTrigger value="all" className="flex items-center gap-1">
                <Activity className="h-4 w-4" />
                ทั้งหมด
              </TabsTrigger>
            </TabsList>

            {/* Suspicious Activities Tab */}
            <TabsContent value="suspicious">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                    กิจกรรมต้องสงสัย
                  </CardTitle>
                  <CardDescription>
                    รายการกิจกรรมที่ระบบตรวจพบว่าผิดปกติ
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : suspiciousLogs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>ไม่พบกิจกรรมต้องสงสัย</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-3">
                        {suspiciousLogs.map(log => (
                          <div 
                            key={log.id} 
                            className="p-3 border rounded-lg bg-destructive/5 border-destructive/20"
                          >
                            <div className="flex items-start justify-between">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant="destructive" className="text-xs">
                                    {getActionTypeLabel(log.action_type)}
                                  </Badge>
                                  <Badge variant={getCategoryBadgeVariant(log.action_category)} className="text-xs">
                                    {log.action_category}
                                  </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  User: {log.user_id?.slice(0, 8) || 'Unknown'}...
                                </p>
                                {log.metadata && Object.keys(log.metadata).length > 0 && (
                                  <p className="text-xs text-muted-foreground font-mono bg-muted/50 px-2 py-1 rounded">
                                    {JSON.stringify(log.metadata).slice(0, 100)}...
                                  </p>
                                )}
                              </div>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                {formatDistanceToNow(new Date(log.created_at), { 
                                  addSuffix: true,
                                  locale: th 
                                })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Summary Tab */}
            <TabsContent value="summary">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    สรุปผู้ใช้ต้องสงสัย (24 ชม.)
                  </CardTitle>
                  <CardDescription>
                    ผู้ใช้ที่มีพฤติกรรมผิดปกติใน 24 ชั่วโมงที่ผ่านมา
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : summary.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>ไม่มีผู้ใช้ต้องสงสัยใน 24 ชม.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {summary.map((item, idx) => (
                        <div 
                          key={idx} 
                          className="p-3 border rounded-lg flex items-center justify-between"
                        >
                          <div className="space-y-1">
                            <p className="text-sm font-medium">
                              User: {item.user_id?.slice(0, 8)}...
                            </p>
                            <div className="flex items-center gap-2">
                              <Badge variant="destructive">{item.action_type}</Badge>
                              <span className="text-xs text-muted-foreground">
                                {item.action_count} ครั้ง
                              </span>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            ล่าสุด: {formatDistanceToNow(new Date(item.last_occurrence), { 
                              addSuffix: true,
                              locale: th 
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* All Logs Tab */}
            <TabsContent value="all">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="h-5 w-5" />
                    กิจกรรมทั้งหมด
                  </CardTitle>
                  <CardDescription>
                    รายการกิจกรรมล่าสุดในระบบ (100 รายการ)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map(i => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : allLogs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>ไม่มีกิจกรรม</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[400px]">
                      <div className="space-y-2">
                        {allLogs.map(log => (
                          <div 
                            key={log.id} 
                            className={`p-2 border rounded-lg flex items-center justify-between ${
                              log.is_suspicious ? 'bg-destructive/5 border-destructive/20' : ''
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              {log.is_suspicious && (
                                <AlertTriangle className="h-4 w-4 text-destructive" />
                              )}
                              <Badge variant={getCategoryBadgeVariant(log.action_category)} className="text-xs">
                                {getActionTypeLabel(log.action_type)}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {log.user_id?.slice(0, 8) || 'Unknown'}...
                              </span>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(log.created_at), { 
                                addSuffix: true,
                                locale: th 
                              })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
