import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { PageTransition } from "@/components/ux/PageTransition";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Key, Calendar, Clock, Edit2 } from "lucide-react";
import { format } from "date-fns";
import { th } from "date-fns/locale";

interface AdminCode {
  id: string;
  code_name: string;
  role: "admin" | "moderator" | "user";
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

const AdminCodesPage = () => {
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<AdminCode | null>(null);
  
  // Form state for create
  const [newCodeName, setNewCodeName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "moderator">("moderator");
  const [newExpiresAt, setNewExpiresAt] = useState("");
  
  // Form state for edit
  const [editCodeName, setEditCodeName] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");
  const [editClearExpiry, setEditClearExpiry] = useState(false);

  const { data: codes, isLoading } = useQuery({
    queryKey: ["admin-codes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_codes")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as AdminCode[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_admin_code", {
        p_code_name: newCodeName,
        p_code: newCode,
        p_role: newRole,
        p_expires_at: newExpiresAt ? new Date(newExpiresAt).toISOString() : null,
      });
      
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success("สร้างรหัสสำเร็จ");
      queryClient.invalidateQueries({ queryKey: ["admin-codes"] });
      setIsCreateOpen(false);
      resetCreateForm();
    },
    onError: (error) => {
      toast.error(error.message || "เกิดข้อผิดพลาด");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (codeId: string) => {
      const { data, error } = await supabase.rpc("update_admin_code", {
        p_code_id: codeId,
        p_code_name: editCodeName || undefined,
        p_expires_at: editExpiresAt ? new Date(editExpiresAt).toISOString() : undefined,
        p_clear_expiry: editClearExpiry,
      });
      
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success("อัปเดตสำเร็จ");
      queryClient.invalidateQueries({ queryKey: ["admin-codes"] });
      setEditingCode(null);
    },
    onError: (error) => {
      toast.error(error.message || "เกิดข้อผิดพลาด");
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ codeId, isActive }: { codeId: string; isActive: boolean }) => {
      const { data, error } = await supabase.rpc("update_admin_code", {
        p_code_id: codeId,
        p_is_active: isActive,
      });
      
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-codes"] });
    },
    onError: (error) => {
      toast.error(error.message || "เกิดข้อผิดพลาด");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (codeId: string) => {
      const { data, error } = await supabase.rpc("delete_admin_code", {
        p_code_id: codeId,
      });
      
      if (error) throw error;
      const result = data as { success: boolean; error?: string };
      if (!result.success) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success("ลบรหัสสำเร็จ");
      queryClient.invalidateQueries({ queryKey: ["admin-codes"] });
    },
    onError: (error) => {
      toast.error(error.message || "เกิดข้อผิดพลาด");
    },
  });

  const resetCreateForm = () => {
    setNewCodeName("");
    setNewCode("");
    setNewRole("moderator");
    setNewExpiresAt("");
  };

  const openEditDialog = (code: AdminCode) => {
    setEditingCode(code);
    setEditCodeName(code.code_name);
    setEditExpiresAt(code.expires_at ? format(new Date(code.expires_at), "yyyy-MM-dd'T'HH:mm") : "");
    setEditClearExpiry(false);
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  return (
    <PageTransition>
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">จัดการรหัสแอดมิน</h1>
            <p className="text-muted-foreground">สร้างและจัดการรหัสพิเศษสำหรับเข้าระบบแอดมิน</p>
          </div>
          
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                สร้างรหัสใหม่
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>สร้างรหัสแอดมินใหม่</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>ชื่อรหัส</Label>
                  <Input
                    placeholder="เช่น Content Creator 1"
                    value={newCodeName}
                    onChange={(e) => setNewCodeName(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>รหัสลับ</Label>
                  <Input
                    placeholder="รหัสที่ใช้ล็อกอิน"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">⚠️ จดรหัสไว้ เพราะจะไม่สามารถดูได้อีก</p>
                </div>
                
                <div className="space-y-2">
                  <Label>สิทธิ์</Label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as "admin" | "moderator")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="moderator">Moderator (จัดการคอนเทนท์)</SelectItem>
                      <SelectItem value="admin">Admin (สิทธิ์เต็ม)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>วันหมดอายุ (ไม่บังคับ)</Label>
                  <Input
                    type="datetime-local"
                    value={newExpiresAt}
                    onChange={(e) => setNewExpiresAt(e.target.value)}
                  />
                </div>
                
                <Button 
                  className="w-full" 
                  onClick={() => createMutation.mutate()}
                  disabled={!newCodeName || !newCode || createMutation.isPending}
                >
                  {createMutation.isPending ? "กำลังสร้าง..." : "สร้างรหัส"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">กำลังโหลด...</div>
        ) : codes?.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>ยังไม่มีรหัสแอดมิน</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {codes?.map((code) => (
              <Card key={code.id} className={isExpired(code.expires_at) ? "opacity-60" : ""}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Key className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{code.code_name}</span>
                          <Badge variant={code.role === "admin" ? "default" : "secondary"}>
                            {code.role}
                          </Badge>
                          {!code.is_active && (
                            <Badge variant="outline" className="text-muted-foreground">ปิดใช้งาน</Badge>
                          )}
                          {isExpired(code.expires_at) && (
                            <Badge variant="destructive">หมดอายุ</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            สร้าง: {format(new Date(code.created_at), "d MMM yyyy", { locale: th })}
                          </span>
                          {code.expires_at && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              หมดอายุ: {format(new Date(code.expires_at), "d MMM yyyy HH:mm", { locale: th })}
                            </span>
                          )}
                          {code.last_used_at && (
                            <span>ใช้ล่าสุด: {format(new Date(code.last_used_at), "d MMM yyyy HH:mm", { locale: th })}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={code.is_active}
                        onCheckedChange={(checked) => 
                          toggleActiveMutation.mutate({ codeId: code.id, isActive: checked })
                        }
                      />
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => openEditDialog(code)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm("ต้องการลบรหัสนี้?")) {
                            deleteMutation.mutate(code.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit Dialog */}
        <Dialog open={!!editingCode} onOpenChange={(open) => !open && setEditingCode(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>แก้ไขรหัส: {editingCode?.code_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>ชื่อรหัส</Label>
                <Input
                  value={editCodeName}
                  onChange={(e) => setEditCodeName(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label>วันหมดอายุ</Label>
                <Input
                  type="datetime-local"
                  value={editExpiresAt}
                  onChange={(e) => {
                    setEditExpiresAt(e.target.value);
                    setEditClearExpiry(false);
                  }}
                  disabled={editClearExpiry}
                />
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editClearExpiry}
                    onCheckedChange={setEditClearExpiry}
                  />
                  <span className="text-sm text-muted-foreground">ไม่มีวันหมดอายุ</span>
                </div>
              </div>
              
              <Button 
                className="w-full" 
                onClick={() => editingCode && updateMutation.mutate(editingCode.id)}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "กำลังบันทึก..." : "บันทึก"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
    </PageTransition>
  );
};

export default AdminCodesPage;
