import { useGlobalChatNotification } from "@/hooks/useGlobalChatNotification";

/**
 * Provider component that enables global chat notification sounds
 * Must be used inside BrowserRouter and AuthProvider
 */
export const GlobalChatNotificationProvider = ({ children }: { children: React.ReactNode }) => {
  useGlobalChatNotification();
  return <>{children}</>;
};
