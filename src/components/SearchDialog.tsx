import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, User, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSearch } from "@/hooks/useSearch";
import { StatusBadge, Status } from "@/components/ui/StatusBadge";

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { results, loading } = useSearch(query);

  const handleSelect = (result: { id: string; type: string; name: string; subtitle: string }) => {
    if (result.type === "agreement") {
      navigate(`/debt/${result.id}`);
    } else if (result.type === "friend") {
      navigate("/create", {
        state: {
          partnerName: result.name,
          partnerPhone: result.subtitle === "ไม่มีเบอร์โทร" ? "" : result.subtitle,
        },
      });
    }
    onOpenChange(false);
    setQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ค้นหา</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="ค้นหาชื่อ หรือข้อตกลง..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
              autoFocus
            />
          </div>
          
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : results.length > 0 ? (
              results.map((result) => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleSelect(result)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-secondary transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                    {result.type === "agreement" ? (
                      <FileText className="w-5 h-5 text-primary" />
                    ) : (
                      <User className="w-5 h-5 text-secondary-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground truncate">{result.name}</p>
                      {result.status && (
                        <StatusBadge status={result.status as Status} size="sm" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{result.subtitle}</p>
                  </div>
                </button>
              ))
            ) : query ? (
              <p className="text-center text-muted-foreground py-8">
                ไม่พบผลลัพธ์
              </p>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                พิมพ์เพื่อค้นหา...
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
