import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function normalizeStoragePath(path: string): string {
  if (!path.includes("/storage/v1/object/public/")) {
    return path;
  }

  const parts = path.split("/storage/v1/object/public/");
  if (!parts[1]) {
    return path;
  }

  const pathParts = parts[1].split("/");
  pathParts.shift();
  return pathParts.join("/");
}

/**
 * Hook to get a signed URL for a private storage file
 * @param bucket - The storage bucket name
 * @param path - The file path in the bucket (extracted from full URL if needed)
 * @param expiresIn - URL expiration time in seconds (default: 5 minutes)
 */
export function useSignedUrl(
  bucket: string,
  path: string | null,
  expiresIn: number = 300
) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    let cancelled = false;

    if (!path) {
      setSignedUrl(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const fetchSignedUrl = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const filePath = normalizeStoragePath(path);

        const { data, error: signError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(filePath, expiresIn);

        if (signError) throw signError;
        if (!cancelled && requestIdRef.current === requestId) {
          setSignedUrl(data.signedUrl);
        }
      } catch (err) {
        if (cancelled || requestIdRef.current !== requestId) {
          return;
        }
        console.error("Error creating signed URL:", err);
        setError(err instanceof Error ? err : new Error("Failed to create signed URL"));
        setSignedUrl(null);
      } finally {
        if (!cancelled && requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    };

    void fetchSignedUrl();

    return () => {
      cancelled = true;
      requestIdRef.current += 1;
    };
  }, [bucket, path, expiresIn]);

  return { signedUrl, isLoading, error };
}

/**
 * Utility function to get a signed URL (for one-time use)
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = 300
): Promise<string | null> {
  try {
    const filePath = normalizeStoragePath(path);

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, expiresIn);

    if (error) throw error;
    return data.signedUrl;
  } catch (err) {
    console.error("Error creating signed URL:", err);
    return null;
  }
}

/**
 * Upload file and return the file path (not URL)
 * Use getSignedUrl to get a temporary URL when needed
 */
export async function uploadToPrivateBucket(
  bucket: string,
  filePath: string,
  file: File,
  options?: { cacheControl?: string; upsert?: boolean }
): Promise<{ path: string } | { error: Error }> {
  try {
    const { error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: options?.cacheControl || "3600",
          upsert: options?.upsert ?? true,
        });

    if (error) throw error;

    // Return the path, not the URL
    // The path can be used later with getSignedUrl
    return { path: filePath };
  } catch (err) {
    console.error("Upload error:", err);
    return { error: err instanceof Error ? err : new Error("Upload failed") };
  }
}
