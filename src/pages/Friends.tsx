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
  X
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDbFriends } from "@/hooks/useDbFriends";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatMaskedPhone } from "@/lib/utils";
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

export default function Friends() {
  const navigate = useNavigate();
  const { friends, addFriend, removeFriend, updateFriend, searchFriends, isLoading } = useDbFriends();
  const { t } = useLanguage();

  const [searchQuery, setSearchQuery] = useState("");
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [friendToDelete, setFriendToDelete] = useState<string | null>(null);
  const [editingFriend, setEditingFriend] = useState<string | null>(null);
  
  // Form state
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");

  const filteredFriends = searchQuery ? searchFriends(searchQuery) : friends;

  const handleAddFriend = async () => {
    if (!newName.trim()) {
      toast.error(t('friends.nameRequired'));
      return;
    }

    try {
      await addFriend({
        name: newName.trim(),
        phone: newPhone.trim() || undefined,
      });

      setNewName("");
      setNewPhone("");
      setShowAddFriend(false);
      toast.success(t('friends.addSuccess'));
    } catch (error) {
      toast.error("เกิดข้อผิดพลาดในการเพิ่มเพื่อน");
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
      <Dialog open={showAddFriend} onOpenChange={setShowAddFriend}>
        <DialogContent className="max-w-md mx-4">
          <DialogHeader>
            <DialogTitle className="font-heading">{t('friends.addNew')}</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                {t('friends.name')} *
              </label>
              <Input
                placeholder={t('friends.namePlaceholder')}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                {t('friends.phone')}
              </label>
              <Input
                placeholder={t('friends.phonePlaceholder')}
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
              />
            </div>

            <Button className="w-full mt-6" onClick={handleAddFriend}>
              <UserPlus className="w-4 h-4 mr-2" />
              {t('friends.add')}
            </Button>
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
