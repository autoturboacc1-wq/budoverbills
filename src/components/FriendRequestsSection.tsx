import { motion, AnimatePresence } from "framer-motion";
import { UserPlus, Check, X, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFriendRequests } from "@/hooks/useFriendRequests";
import { useState } from "react";

export function FriendRequestsSection() {
  const { incomingRequests, outgoingRequests, acceptRequest, rejectRequest, cancelRequest, isLoading } = useFriendRequests();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const handleAccept = async (requestId: string) => {
    setProcessingIds(prev => new Set(prev).add(requestId));
    try {
      await acceptRequest(requestId);
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  const handleReject = async (requestId: string) => {
    setProcessingIds(prev => new Set(prev).add(requestId));
    try {
      await rejectRequest(requestId);
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  const handleCancel = async (requestId: string) => {
    setProcessingIds(prev => new Set(prev).add(requestId));
    try {
      await cancelRequest(requestId);
    } finally {
      setProcessingIds(prev => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  if (isLoading) {
    return null;
  }

  if (incomingRequests.length === 0 && outgoingRequests.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="bg-card rounded-2xl p-5 shadow-card mb-6"
    >
      {/* Incoming Requests */}
      {incomingRequests.length > 0 && (
        <div className="mb-4">
          <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            คำขอเป็นเพื่อน
            <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
              {incomingRequests.length}
            </span>
          </h3>
          <AnimatePresence>
            {incomingRequests.map((request) => (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center justify-between p-3 bg-secondary/30 rounded-xl mb-2 last:mb-0"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-semibold text-primary">
                      {(request.from_profile?.display_name || "U").charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">
                      {request.from_profile?.display_name || `User ${request.from_profile?.user_code}`}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {request.from_profile?.user_code}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-status-overdue hover:bg-status-overdue/10"
                    onClick={() => handleReject(request.id)}
                    disabled={processingIds.has(request.id)}
                    aria-label={`ปฏิเสธคำขอจาก ${request.from_profile?.display_name || `User ${request.from_profile?.user_code}`}`}
                  >
                    {processingIds.has(request.id) ? (
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <X className="w-4 h-4" aria-hidden="true" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 px-3"
                    onClick={() => handleAccept(request.id)}
                    disabled={processingIds.has(request.id)}
                    aria-label={`ยอมรับคำขอจาก ${request.from_profile?.display_name || `User ${request.from_profile?.user_code}`}`}
                  >
                    {processingIds.has(request.id) ? (
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <>
                        <Check className="w-4 h-4 mr-1" />
                        ยอมรับ
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Outgoing Requests */}
      {outgoingRequests.length > 0 && (
        <div>
          {incomingRequests.length > 0 && <div className="border-t border-border my-4" />}
          <h3 className="font-medium text-muted-foreground mb-3 flex items-center gap-2 text-sm">
            <Clock className="w-4 h-4" />
            คำขอที่ส่งไป
          </h3>
          <AnimatePresence>
            {outgoingRequests.map((request) => (
              <motion.div
                key={request.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center justify-between p-3 bg-secondary/20 rounded-xl mb-2 last:mb-0"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-sm font-semibold text-muted-foreground">
                      {(request.to_profile?.display_name || "U").charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">
                      {request.to_profile?.display_name || `User ${request.to_profile?.user_code}`}
                    </p>
                    <p className="text-xs text-muted-foreground">รอการตอบรับ</p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-8 text-muted-foreground hover:text-foreground"
                  onClick={() => handleCancel(request.id)}
                  disabled={processingIds.has(request.id)}
                  aria-label={`ยกเลิกคำขอที่ส่งถึง ${request.to_profile?.display_name || `User ${request.to_profile?.user_code}`}`}
                >
                  {processingIds.has(request.id) ? (
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  ) : (
                    "ยกเลิก"
                  )}
                </Button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
