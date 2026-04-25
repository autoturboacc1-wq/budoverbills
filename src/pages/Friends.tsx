import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowLeft, 
  Plus, 
  Search, 
  UserPlus, 
  Trash2,
  Phone,
  Edit2,
  Check,
  X,
  Loader2,
  Send
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDbFriends } from "@/hooks/useDbFriends";
import { useFriendRequests } from "@/hooks/useFriendRequests";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatMaskedPhone } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { PageTransition } from "@/components/ux/PageTransition";

const normalizeUserCode = (value: string) => value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8);

interface FoundUser {
  user_id: string;
  display_name: string | null;
  user_code: string | null;
}

export default function Friends() {
  const navigate = useNavigate();
  const { friends, removeFriend, updateFriend, searchFriends, isLoading } = useDbFriends();
  const { sendRequest, outgoingRequests } = useFriendRequests();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [searchQuery, setSearchQuery] = useState("");
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [friendToDelete, setFriendToDelete] = useState<string | null>(null);
  const [editingFriend, setEditingFriend] = useState<string | null>(null);
  
  const [userCode, setUserCode] = useState("");
  const [foundUser, setFoundUser] = useState<FoundUser | null>(null);
  const [isSearchingUser, setIsSearchingUser] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const filteredFriends = searchQuery ? searchFriends(searchQuery) : friends;

  const lookupUserByCode = async (code: string) => {
    const { data, error } = await supabase.rpc("search_profile_by_code", {
      search_code: normalizeUserCode(code),
    });

    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) return null;

    return data[0] as FoundUser;
  };

  const handleSearchUserCode = async () => {
    const code = normalizeUserCode(userCode);
    if (code.length !== 8) {
      toast.error("กรุณาใส่รหัสผู้ใช้ 8 ตัวอักษร");
      return;
    }

    setIsSearchingUser(true);
    setFoundUser(null);

    try {
      const data = await lookupUserByCode(code);

      if (!data) {
        toast.error("ไม่พบผู้ใช้ที่มีรหัสนี้");
        return;
      }

      if (data.user_id === user?.id) {
        toast.error("ไม่สามารถเพิ่มตัวเองเป็นเพื่อนได้");
        return;
      }

      const alreadyFriend = friends.some((friend) => friend.friend_user_id === data.user_id);
      if (alreadyFriend) {
        toast.info("ผู้ใช้นี้เป็นเพื่อนของคุณอยู่แล้ว");
        setShowAddFriend(false);
        setUserCode("");
        return;
      }

      setFoundUser(data);
    } catch (error) {
      console.error("Search friend by code error:", error);
      toast.error("เกิดข้อผิดพลาดในการค้นหา");
    } finally {
      setIsSearchingUser(false);
    }
  };

  const handleSendFriendRequest = async () => {
    if (!foundUser) return;

    const success = await sendRequest(foundUser.user_id);
    if (success) {
      setShowAddFriend(false);
      setUserCode("");
      setFoundUser(null);
    }
  };

  const resetAddFriendDialog = (open: boolean) => {
    setShowAddFriend(open);
    if (!open) {
      setUserCode("");
      setFoundUser(null);
      setIsSearchingUser(false);
    }
  };

  const handleDeleteFriend = async () => {
    if (friendToDelete) {
      try {
        await removeFriend(friendToDelete);
        setFriendToDelete(null);
        setShowDeleteConfirm(false);
        toast.success(t('friends.deleteSuccess'));
      } catch (error) {
        toast.error("เกิดข้อผิดพลาดในการลบเพื่อน");
      }
    }
  };

  const startEditing = (friend: { id: string; friend_name: string; friend_phone?: string | null }) => {
    setEditingFriend(friend.id);
    setEditName(friend.friend_name);
    setEditPhone(friend.friend_phone || "");
  };

  const saveEdit = async () => {
    if (editingFriend && editName.trim()) {
      try {
        await updateFriend(editingFriend, {
          friend_name: editName.trim(),
          friend_phone: editPhone.trim() || undefined,
        });
        setEditingFriend(null);
        toast.success(t('friends.updateSuccess'));
      } catch (error) {
        toast.error("เกิดข้อผิดพลาดในการแก้ไข");
      }
    }
  };

  const cancelEdit = () => {
    setEditingFriend(null);
    setEditName("");
    setEditPhone("");
  };

  return (
    <PageTransition>
    <div className="min-h-screen bg-gradient-hero pb-24">
      <div className="max-w-md mx-auto px-5">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between py-4"
        >
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-secondary-foreground" />
            </button>
            <div>
              <h1 className="text-xl font-heading font-semibold text-foreground">
                {t('friends.title')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {friends.length} {t('friends.count')}
              </p>
            </div>
          </div>
          <Button 
            size="icon" 
            className="rounded-full"
            onClick={() => setShowAddFriend(true)}
          >
            <UserPlus className="w-5 h-5" />
          </Button>
        </motion.header>

        {/* Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4"
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder={t('friends.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </motion.div>

        {/* Friends List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-2xl shadow-card overflow-hidden"
        >
          {filteredFriends.length === 0 ? (
            <div className="text-center py-12">
              {searchQuery ? (
                <>
                  <p className="text-muted-foreground">{t('friends.noResults')}</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-4"
                    onClick={() => setSearchQuery("")}
                  >
                    {t('friends.clearSearch')}
                  </Button>
                </>
              ) : (
                <>
                  <UserPlus className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground mb-2">{t('friends.noFriends')}</p>
                  <p className="text-sm text-muted-foreground mb-4">{t('friends.addFirstHint')}</p>
                  <Button onClick={() => setShowAddFriend(true)}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t('friends.addFirst')}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <AnimatePresence>
              {filteredFriends.map((friend, index) => (
                <motion.div
                  key={friend.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ delay: index * 0.05 }}
                  className="border-b border-border last:border-b-0"
                >
                  {editingFriend === friend.id ? (
                    // Edit Mode
                    <div className="p-4 space-y-3 bg-secondary/30">
                      <Input
                        placeholder={t('friends.namePlaceholder')}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                      />
                      <Input
                        placeholder={t('friends.phonePlaceholder')}
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={saveEdit} className="flex-1">
                          <Check className="w-4 h-4 mr-1" />
                          {t('common.save')}
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelEdit} className="flex-1">
                          <X className="w-4 h-4 mr-1" />
                          {t('common.cancel')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    // View Mode
                    <div className="flex items-center justify-between p-4 hover:bg-secondary/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-lg font-heading font-semibold text-primary">
                            {friend.friend_name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{friend.friend_name}</p>
                          {friend.nickname && (
                            <p className="text-xs text-muted-foreground">({friend.nickname})</p>
                          )}
                          {friend.friend_phone && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {formatMaskedPhone(friend.friend_phone)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => startEditing(friend)}
                          className="p-2 rounded-full hover:bg-secondary transition-colors"
                        >
                          <Edit2 className="w-4 h-4 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => {
                            setFriendToDelete(friend.id);
                            setShowDeleteConfirm(true);
                          }}
                          className="p-2 rounded-full hover:bg-status-overdue/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4 text-status-overdue" />
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </motion.div>
      </div>

      {/* Add Friend Dialog */}
      <Dialog open={showAddFriend} onOpenChange={resetAddFriendDialog}>
        <DialogContent className="max-w-md mx-4">
          <DialogHeader>
            <DialogTitle className="font-heading">เพิ่มเพื่อนด้วยรหัสผู้ใช้</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            {!foundUser ? (
              <>
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    รหัสผู้ใช้ 8 ตัวอักษร
                  </label>
                  <Input
                    placeholder="ABC12345"
                    value={userCode}
                    onChange={(e) => setUserCode(normalizeUserCode(e.target.value))}
                    className="h-12 text-center font-mono text-lg tracking-widest uppercase"
                    maxLength={8}
                    autoFocus
                  />
                </div>
                <Button
                  type="button"
                  className="w-full mt-6"
                  onClick={handleSearchUserCode}
                  disabled={userCode.length !== 8 || isSearchingUser}
                >
                  {isSearchingUser ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                      กำลังค้นหา...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" aria-hidden="true" />
                      ค้นหาผู้ใช้
                    </>
                  )}
                </Button>
              </>
            ) : (
              <div className="space-y-4 text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <span className="text-2xl font-heading font-bold text-primary">
                    {(foundUser.display_name || "U").charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="font-semibold text-foreground text-lg">
                    {foundUser.display_name || `User ${foundUser.user_code}`}
                  </p>
                  <p className="text-sm text-muted-foreground font-mono">
                    {foundUser.user_code}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setFoundUser(null)}
                  >
                    ย้อนกลับ
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={handleSendFriendRequest}
                    disabled={outgoingRequests.some((request) => request.to_user_id === foundUser.user_id)}
                  >
                    <Send className="w-4 h-4 mr-2" aria-hidden="true" />
                    ส่งคำขอ
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="max-w-md mx-4">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('friends.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('friends.deleteConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteFriend}
              className="bg-status-overdue hover:bg-status-overdue/90"
            >
              {t('friends.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
    </PageTransition>
  );
}
