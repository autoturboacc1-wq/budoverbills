import { useState, useRef } from "react";
import { Camera, Loader2, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_AVATAR_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

async function readFileHeader(file: File, size: number): Promise<Uint8Array> {
  const blob = file.slice(0, size);

  if (typeof blob.arrayBuffer === "function") {
    return new Uint8Array(await blob.arrayBuffer());
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read avatar header"));
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error("Failed to read avatar header"));
        return;
      }

      resolve(new Uint8Array(reader.result));
    };
    reader.readAsArrayBuffer(blob);
  });
}

async function validateAvatarMagicBytes(file: File): Promise<boolean> {
  const header = await readFileHeader(file, 16);

  switch (file.type) {
    case "image/jpeg":
      return header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    case "image/png":
      return (
        header.length >= 8 &&
        header[0] === 0x89 &&
        header[1] === 0x50 &&
        header[2] === 0x4e &&
        header[3] === 0x47 &&
        header[4] === 0x0d &&
        header[5] === 0x0a &&
        header[6] === 0x1a &&
        header[7] === 0x0a
      );
    case "image/webp":
      return (
        header.length >= 12 &&
        header[0] === 0x52 &&
        header[1] === 0x49 &&
        header[2] === 0x46 &&
        header[3] === 0x46 &&
        header[8] === 0x57 &&
        header[9] === 0x45 &&
        header[10] === 0x42 &&
        header[11] === 0x50
      );
    default:
      return false;
  }
}

function getAvatarStoragePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;

  try {
    const pathname = new URL(url).pathname;
    const marker = "/avatars/";
    const index = pathname.indexOf(marker);

    if (index === -1) {
      return null;
    }

    return decodeURIComponent(pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  displayName: string;
  onAvatarChange?: (url: string) => void;
}

export function AvatarUpload({ currentAvatarUrl, displayName, onAvatarChange }: AvatarUploadProps) {
  const { user, refreshProfile } = useAuth();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const displayInitial = displayName.charAt(0).toUpperCase();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    const fileExt = ALLOWED_AVATAR_MIME_TYPES[file.type];

    // Validate file type
    if (!fileExt) {
      toast.error("กรุณาเลือกไฟล์รูปภาพเท่านั้น");
      return;
    }

    // BUG-PROF-04: This client-side size check improves UX by giving fast feedback,
    // but it is NOT a security boundary — a malicious client can bypass it by
    // sending the upload request directly. The real enforcement must be configured
    // on the Supabase Storage "avatars" bucket (max_file_size_bytes policy), which
    // is the authoritative guard. Keep both in sync.
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      toast.error("ไฟล์ใหญ่เกินไป (สูงสุด 5MB)");
      return;
    }

    setIsUploading(true);

    let uploadedPath: string | null = null;
    const oldAvatarPath = getAvatarStoragePathFromUrl(currentAvatarUrl);

    try {
      const isValidBinary = await validateAvatarMagicBytes(file);
      if (!isValidBinary) {
        toast.error("ไฟล์รูปภาพไม่ถูกต้อง");
        return;
      }

      // Generate unique filename from the MIME type, not the original file name.
      const fileName = `${user.id}/avatar-${Date.now()}.${fileExt}`;

      // Upload new avatar
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;
      uploadedPath = fileName;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('user_id', user.id);

      if (updateError) throw updateError;

      // Delete the old avatar only after the profile now points at the new one.
      if (oldAvatarPath && oldAvatarPath !== fileName) {
        const { error: removeError } = await supabase.storage
          .from('avatars')
          .remove([oldAvatarPath]);

        if (removeError) {
          console.warn("Failed to remove old avatar:", removeError);
        }
      }

      toast.success("อัปโหลดรูปโปรไฟล์สำเร็จ");
      onAvatarChange?.(publicUrl);
      
      // Refresh profile to update UI
      if (refreshProfile) {
        await refreshProfile();
      }
    } catch (error) {
      if (uploadedPath) {
        await supabase.storage.from('avatars').remove([uploadedPath]).catch(() => null);
      }
      console.error('Upload error:', error);
      toast.error("ไม่สามารถอัปโหลดรูปได้");
    } finally {
      setIsUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="relative group">
      <motion.div
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="w-20 h-20 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center mx-auto cursor-pointer relative"
        onClick={() => fileInputRef.current?.click()}
      >
        {currentAvatarUrl ? (
          <img 
            src={currentAvatarUrl} 
            alt={displayName}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-3xl font-heading font-bold text-primary">{displayInitial}</span>
        )}
        
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {isUploading ? (
            <Loader2 className="w-6 h-6 text-white animate-spin" />
          ) : (
            <Camera className="w-6 h-6 text-white" />
          )}
        </div>
      </motion.div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileSelect}
        className="hidden"
        disabled={isUploading}
      />

      {/* Upload hint */}
      <p className="text-xs text-muted-foreground text-center mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        คลิกเพื่อเปลี่ยนรูป
      </p>
    </div>
  );
}
