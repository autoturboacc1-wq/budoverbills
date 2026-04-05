import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QrCode, UserPlus, Search, Copy, Check, Scan, Loader2, Send, ChevronDown } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useDbFriends } from "@/hooks/useDbFriends";
import { useFriendRequests } from "@/hooks/useFriendRequests";
import { QRCodeScanner } from "@/components/QRCodeScanner";

export function AddFriendSection() {
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [searchCode, setSearchCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [foundUser, setFoundUser] = useState<{
    user_id: string;
    display_name: string | null;
    user_code: string | null;
  } | null>(null);
  
  const { profile, user, requireAuth } = useAuth();
  const navigate = useNavigate();
  const { friends } = useDbFriends();
  const { sendRequest, outgoingRequests } = useFriendRequests();

  const userCode = profile?.user_code || "XXXXXXXX";
  const qrValue = `debtmate://add-friend/${userCode}`;

  const lookupUserByCode = async (code: string) => {
    const { data, error } = await supabase.rpc("search_profile_by_code", {
      search_code: code.toUpperCase(),
    });

    if (error) throw error;

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    return data[0] as {
      user_id: string;
      display_name: string | null;
      user_code: string | null;
    };
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(userCode);
    setCopied(true);
    toast.success("คัดลอกรหัสแล้ว");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddFriend = () => {
    if (!requireAuth("add friend")) {
      navigate("/auth", { state: { from: { pathname: "/profile" } } });
      return;
    }
    navigate("/friends");
  };

  const handleScanQR = () => {
    if (!requireAuth("scan QR")) {
      navigate("/auth", { state: { from: { pathname: "/profile" } } });
      return;
    }
    setShowScanner(true);
  };

  const handleQRScanned = async (decodedText: string) => {
    // Parse the QR code - expected format: debtmate://add-friend/USERCODE
    const match = decodedText.match(/debtmate:\/\/add-friend\/([A-Z0-9]{8})/);
    if (!match) {
      toast.error("QR code ไม่ถูกต้อง");
      return;
    }

    const scannedCode = match[1];
    
    try {
      const data = await lookupUserByCode(scannedCode);

      if (!data) {
        toast.error("ไม่พบผู้ใช้ที่มีรหัสนี้");
        return;
      }

      if (data.user_id === user?.id) {
        toast.error("ไม่สามารถเพิ่มตัวเองเป็นเพื่อนได้");
        return;
      }

      // Check if already friends
      const alreadyFriend = friends.some(f => f.friend_user_id === data.user_id);
      if (alreadyFriend) {
        toast.info("ผู้ใช้นี้เป็นเพื่อนของคุณอยู่แล้ว");
        return;
      }

      // Check if already has pending request
      const hasPendingRequest = outgoingRequests.some(r => r.to_user_id === data.user_id);
      if (hasPendingRequest) {
        toast.info("มีคำขอเป็นเพื่อนรอดำเนินการอยู่แล้ว");
        return;
      }

      // Send friend request instead of adding directly
      await sendRequest(data.user_id);
      setShowScanner(false);
    } catch (error: unknown) {
      console.error("QR scan add friend error:", error);
      toast.error("เกิดข้อผิดพลาด");
    }
  };

  const handleSearchByCode = async () => {
    if (!requireAuth("search friend")) {
      navigate("/auth", { state: { from: { pathname: "/profile" } } });
      return;
    }
    if (!searchCode.trim() || searchCode.length !== 8) return;

    setIsSearching(true);
    setFoundUser(null);

    try {
      const data = await lookupUserByCode(searchCode);

      if (!data) {
        toast.error("ไม่พบผู้ใช้ที่มีรหัสนี้");
        return;
      }

      if (data.user_id === user?.id) {
        toast.error("ไม่สามารถเพิ่มตัวเองเป็นเพื่อนได้");
        return;
      }

      // Check if already friends
      const alreadyFriend = friends.some(f => f.friend_user_id === data.user_id);
      if (alreadyFriend) {
        toast.info("ผู้ใช้นี้เป็นเพื่อนของคุณอยู่แล้ว");
        setShowSearchDialog(false);
        setSearchCode("");
        setFoundUser(null);
        return;
      }

      setFoundUser(data);
    } catch (error: unknown) {
      console.error("Search error:", error);
      toast.error("เกิดข้อผิดพลาดในการค้นหา");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendRequestToFoundUser = async () => {
    if (!foundUser) return;

    try {
      const success = await sendRequest(foundUser.user_id);
      if (success) {
        setShowSearchDialog(false);
        setSearchCode("");
        setFoundUser(null);
      }
    } catch (error: unknown) {
      console.error("Send request error:", error);
      toast.error("เกิดข้อผิดพลาดในการส่งคำขอ");
    }
  };

  const handleShowMyQR = () => {
    if (!requireAuth("show QR")) {
      navigate("/auth", { state: { from: { pathname: "/profile" } } });
      return;
    }
    setShowQRDialog(true);
  };

  const actionButtons = [
    {
      icon: QrCode,
      label: "QR ของฉัน",
      onClick: handleShowMyQR,
      variant: "default" as const,
    },
    {
      icon: Scan,
      label: "สแกน QR",
      onClick: handleScanQR,
      variant: "outline" as const,
    },
    {
      icon: Search,
      label: "ค้นหาด้วยรหัส",
      onClick: () => {
        if (!requireAuth("search friend")) {
          navigate("/auth", { state: { from: { pathname: "/profile" } } });
          return;
        }
        setShowSearchDialog(true);
      },
      variant: "outline" as const,
    },
    {
      icon: UserPlus,
      label: "จัดการเพื่อน",
      onClick: handleAddFriend,
      variant: "outline" as const,
    },
  ];

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mb-6"
      >
        {/* Expandable Button */}
        <Button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          variant="outline"
          aria-expanded={isExpanded}
          aria-controls="add-friend-panel"
          className="w-full h-12 flex items-center justify-between px-4 bg-gradient-to-r from-primary/10 to-transparent border-primary/30 hover:bg-primary/15"
        >
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            <span className="font-medium">เพิ่มเพื่อน</span>
          </div>
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          </motion.div>
        </Button>

        {/* Expanded Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div id="add-friend-panel" className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent rounded-b-2xl p-4 border border-t-0 border-primary/20">
                {/* User Code Display */}
                {user && (
                  <div className="bg-card rounded-xl p-3 mb-4">
                    <p className="text-xs text-muted-foreground mb-1">รหัสผู้ใช้ของคุณ</p>
                    <div className="flex items-center justify-between">
                      <span className="text-lg font-mono font-bold text-foreground tracking-wider">
                        {userCode}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleCopyCode}
                        className="h-8 px-2"
                        aria-label="คัดลอกรหัสผู้ใช้"
                      >
                        {copied ? (
                          <Check className="w-4 h-4 text-status-paid" aria-hidden="true" />
                        ) : (
                          <Copy className="w-4 h-4" aria-hidden="true" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Action Buttons - Horizontal scroll */}
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {actionButtons.map((btn, index) => (
                    <Button
                      type="button"
                      key={index}
                      onClick={btn.onClick}
                      variant={btn.variant}
                      className={`flex-shrink-0 h-11 px-4 gap-2 ${
                        btn.variant === "default" 
                          ? "bg-primary hover:bg-primary/90" 
                          : "border-primary/30 text-primary hover:bg-primary/10"
                      }`}
                    >
                      <btn.icon className="w-4 h-4" aria-hidden="true" />
                      <span className="text-sm whitespace-nowrap">{btn.label}</span>
                    </Button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* QR Code Dialog */}
      <Dialog open={showQRDialog} onOpenChange={setShowQRDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center">QR code ของฉัน</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center py-6">
            <div className="bg-white p-4 rounded-2xl shadow-lg mb-4">
              <QRCodeSVG
                value={qrValue}
                size={200}
                level="H"
                includeMargin
              />
            </div>
            <p className="text-sm text-muted-foreground mb-2">รหัสผู้ใช้</p>
            <div className="flex items-center gap-2">
              <span className="text-xl font-mono font-bold text-foreground tracking-wider">
                {userCode}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCopyCode}
                className="h-8 px-2"
                aria-label="คัดลอกรหัสผู้ใช้"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-status-paid" aria-hidden="true" />
                ) : (
                  <Copy className="w-4 h-4" aria-hidden="true" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-4 text-center">
              ให้เพื่อนสแกน QR code นี้หรือใส่รหัสเพื่อเพิ่มเป็นเพื่อน
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Search by Code Dialog */}
      <Dialog open={showSearchDialog} onOpenChange={(open) => {
        setShowSearchDialog(open);
        if (!open) {
          setSearchCode("");
          setFoundUser(null);
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>ค้นหาด้วยรหัสผู้ใช้</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            {!foundUser ? (
              <>
                <div>
                  <Input
                    value={searchCode}
                    onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
                    placeholder="ใส่รหัส 8 ตัวอักษร"
                    aria-label="รหัสผู้ใช้ 8 ตัวอักษร"
                    className="h-12 text-center font-mono text-lg tracking-widest"
                    maxLength={8}
                  />
                </div>
                <Button
                  type="button"
                  onClick={handleSearchByCode}
                  className="w-full h-12"
                  disabled={searchCode.length !== 8 || isSearching}
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                      กำลังค้นหา...
                    </>
                  ) : (
                    "ค้นหา"
                  )}
                </Button>
              </>
            ) : (
              <div className="text-center space-y-4">
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
                    ยกเลิก
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={handleSendRequestToFoundUser}
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

      {/* QR Scanner */}
      <QRCodeScanner
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleQRScanned}
      />
    </>
  );
}
