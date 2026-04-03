import { supabase } from "@/integrations/supabase/client";

// Utility to get device/browser information for legal evidence logging

export interface DeviceInfo {
  userAgent: string;
  platform: string;
  language: string;
  screenResolution: string;
  timezone: string;
  deviceId: string;
}

// Generate a simple device fingerprint (not cryptographically secure, but sufficient for audit purposes)
function generateDeviceFingerprint(): string {
  const components = [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    screen.width + "x" + screen.height,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency || 0,
  ];
  
  // Simple hash function
  let hash = 0;
  const str = components.join("|");
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return Math.abs(hash).toString(16).toUpperCase().padStart(8, "0");
}

export function getDeviceInfo(): DeviceInfo {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screenResolution: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    deviceId: generateDeviceFingerprint(),
  };
}

export function getDeviceIdString(): string {
  const info = getDeviceInfo();
  return `${info.deviceId}|${info.platform}|${info.screenResolution}`;
}

// Get IP address - will be fetched from a service
export async function getClientIP(): Promise<string> {
  try {
    const { data, error } = await supabase.functions.invoke<{ ip?: string }>("request-client-context", {
      method: "POST",
      body: {},
    });

    if (error) {
      throw error;
    }

    if (data?.ip) {
      return data.ip;
    }
  } catch (error) {
    console.warn("Could not fetch IP address from server context:", error);
  }
  
  return "unknown";
}
