import { useState } from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';
import { Clock, ArrowRight, Shield, Check, X, AlertCircle, Eye, Receipt } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RescheduleRequest, useRescheduleRequests } from '@/hooks/useRescheduleRequests';

interface RescheduleApprovalCardProps {
  request: RescheduleRequest;
  isLender: boolean;
  partnerName: string;
  onUpdate?: () => void;
}

export function RescheduleApprovalCard({
  request,
  isLender,
  partnerName,
  onUpdate
}: RescheduleApprovalCardProps) {
  const { approveRequest, rejectRequest, cancelRequest } = useRescheduleRequests();
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showSlipDialog, setShowSlipDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    const success = await approveRequest(request.id);
    setLoading(false);
    if (success) onUpdate?.();
  };

  const handleReject = async () => {
    setLoading(true);
    const success = await rejectRequest(request.id, rejectReason);
    setLoading(false);
    if (success) {
      setShowRejectDialog(false);
      onUpdate?.();
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    const success = await cancelRequest(request.id);
    setLoading(false);
    if (success) onUpdate?.();
  };

  const getStatusBadge = () => {
    switch (request.status) {
      case 'pending':
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">รอการอนุมัติ</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">อนุมัติแล้ว</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">ถูกปฏิเสธ</Badge>;
      default:
        return null;
    }
  };

  // Check if submitted amount matches the fee
  const amountMatches = request.submitted_amount === request.reschedule_fee;
  const amountDifference = (request.submitted_amount || 0) - request.reschedule_fee;

  return (
    <>
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {isLender ? `${partnerName} ขอเลื่อนงวด` : 'คำขอเลื่อนงวด'}
                  </span>
                  {getStatusBadge()}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                  <span>{format(new Date(request.original_due_date), 'd MMM', { locale: th })}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="text-primary font-medium">
                    {format(new Date(request.new_due_date), 'd MMM yyyy', { locale: th })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Fee & Payment Details */}
          <div className="mt-3 p-3 rounded-lg bg-muted/30 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ค่าเลื่อนงวด</span>
              <span className="font-medium">฿{request.reschedule_fee.toLocaleString()}</span>
            </div>
            
            {/* Show submitted amount */}
            {request.submitted_amount != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">ยอดที่โอน</span>
                <span className={`font-medium ${amountMatches ? 'text-green-600' : amountDifference > 0 ? 'text-blue-600' : 'text-amber-600'}`}>
                  ฿{request.submitted_amount.toLocaleString()}
                  {!amountMatches && (
                    <span className="text-xs ml-1">
                      ({amountDifference > 0 ? `+${amountDifference}` : amountDifference})
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* Slip button */}
            {request.slip_url && (
              <Button
                variant="outline"
                size="sm"
                className="w-full mt-2"
                onClick={() => setShowSlipDialog(true)}
              >
                <Eye className="h-4 w-4 mr-2" />
                ดูสลิปการโอนเงิน
              </Button>
            )}

            {request.safeguard_applied && (
              <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                <Shield className="h-3 w-3" />
                <span>Safeguard: ลดจาก {request.original_fee_rate}% เป็น {request.applied_fee_rate}%</span>
              </div>
            )}
          </div>

          {/* Rejection Reason */}
          {request.status === 'rejected' && request.rejection_reason && (
            <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-start gap-2 text-sm text-red-600">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{request.rejection_reason}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          {request.status === 'pending' && (
            <div className="mt-3 flex gap-2">
              {isLender ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setShowRejectDialog(true)}
                    disabled={loading}
                  >
                    <X className="h-4 w-4 mr-1" />
                    ปฏิเสธ
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={handleApprove}
                    disabled={loading}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    ยืนยันรับเงิน
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-muted-foreground"
                  onClick={handleCancel}
                  disabled={loading}
                >
                  ยกเลิกคำขอ
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Slip Preview Dialog */}
      <Dialog open={showSlipDialog} onOpenChange={setShowSlipDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              สลิปค่าเลื่อนงวด
            </DialogTitle>
            <DialogDescription>
              ยอดที่ต้องชำระ: ฿{request.reschedule_fee.toLocaleString()}
              {request.submitted_amount != null && (
                <span className={`ml-2 ${amountMatches ? 'text-green-600' : 'text-amber-600'}`}>
                  • ยอดที่โอน: ฿{request.submitted_amount.toLocaleString()}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="mt-4">
            {request.slip_url && (
              request.slip_url.toLowerCase().endsWith('.pdf') ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">ไฟล์ PDF</p>
                  <Button variant="outline" onClick={() => window.open(request.slip_url!, '_blank')}>
                    เปิดดู PDF
                  </Button>
                </div>
              ) : (
                <img
                  src={request.slip_url}
                  alt="Payment slip"
                  className="w-full rounded-lg cursor-pointer"
                  onClick={() => window.open(request.slip_url!, '_blank')}
                />
              )
            )}
          </div>

          {/* Amount comparison info */}
          {request.submitted_amount != null && !amountMatches && (
            <div className={`p-3 rounded-lg mt-4 ${amountDifference > 0 ? 'bg-blue-500/10' : 'bg-amber-500/10'}`}>
              <p className={`text-sm ${amountDifference > 0 ? 'text-blue-600' : 'text-amber-600'}`}>
                {amountDifference > 0 
                  ? `ผู้ยืมโอนเกิน ฿${amountDifference.toLocaleString()}`
                  : `ผู้ยืมโอนขาด ฿${Math.abs(amountDifference).toLocaleString()}`
                }
              </p>
            </div>
          )}

          {isLender && request.status === 'pending' && (
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                className="flex-1 text-red-600"
                onClick={() => {
                  setShowSlipDialog(false);
                  setShowRejectDialog(true);
                }}
              >
                <X className="h-4 w-4 mr-1" />
                ปฏิเสธ
              </Button>
              <Button
                className="flex-1"
                onClick={async () => {
                  setShowSlipDialog(false);
                  await handleApprove();
                }}
                disabled={loading}
              >
                <Check className="h-4 w-4 mr-1" />
                ยืนยันรับเงิน
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>ปฏิเสธคำขอเลื่อนงวด</DialogTitle>
            <DialogDescription>
              กรุณาระบุเหตุผลในการปฏิเสธ (ไม่บังคับ)
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="เหตุผลในการปฏิเสธ..."
            className="min-h-[80px]"
          />
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowRejectDialog(false)}
            >
              ยกเลิก
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleReject}
              disabled={loading}
            >
              ยืนยันปฏิเสธ
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}