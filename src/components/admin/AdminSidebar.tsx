import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Shield,
  UserCog,
  LogOut,
  ChevronLeft,
  Menu,
  Key,
} from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { clearAdminSession } from "@/utils/adminSession";

const adminMenuItems = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    path: "/admin",
    requiredRole: "moderator" as const,
  },
  {
    title: "Security",
    icon: Shield,
    path: "/admin/security",
    requiredRole: "admin" as const,
  },
  {
    title: "จัดการสิทธิ์",
    icon: UserCog,
    path: "/admin/users",
    requiredRole: "admin" as const,
  },
  {
    title: "รหัสแอดมิน",
    icon: Key,
    path: "/admin/codes",
    requiredRole: "admin" as const,
  },
];

interface AdminSidebarProps {
  isCodeLogin?: boolean;
  isCodeAdmin?: boolean;
}

export function AdminSidebar({ isCodeLogin = false, isCodeAdmin = false }: AdminSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, isModerator } = useUserRole();
  const { profile } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const isMobile = useIsMobile();
  
  // Use code-based role if code login, otherwise use database role
  const effectiveIsAdmin = isCodeLogin ? isCodeAdmin : isAdmin;
  const codeName = isCodeLogin ? sessionStorage.getItem("admin_code_name") : null;

  const visibleMenuItems = adminMenuItems.filter((item) => {
    if (item.requiredRole === "admin") return effectiveIsAdmin;
    return true;
  });

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo/Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <h1 className="font-heading font-bold text-sidebar-foreground">
                Admin Panel
              </h1>
              <p className="text-xs text-sidebar-foreground/60">
                {effectiveIsAdmin ? "Administrator" : "Moderator"}
              </p>
            </motion.div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1">
        {visibleMenuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground/80"
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span className="text-sm">{item.title}</span>}
            </button>
          );
        })}
      </nav>

      <Separator className="mx-3" />

      {/* User Section */}
      <div className="p-3 space-y-2">
        <div
          className={cn(
            "flex items-center gap-3 p-2 rounded-lg",
            collapsed ? "justify-center" : ""
          )}
        >
          <Avatar className="w-9 h-9">
            <AvatarImage src={!isCodeLogin ? profile?.avatar_url || undefined : undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
              {isCodeLogin ? (codeName?.[0] || "C") : (profile?.display_name?.[0] || "A")}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {isCodeLogin ? (codeName || "Content Team") : (profile?.display_name || "Admin")}
              </p>
              <p className="text-xs text-sidebar-foreground/60">
                {effectiveIsAdmin ? "Admin" : "Mod"}
              </p>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (isCodeLogin) {
              // Clear code session and go back to code login
              clearAdminSession();
              navigate("/admin/code");
            } else {
              navigate("/profile");
            }
          }}
          className={cn(
            "w-full justify-start gap-3 text-sidebar-foreground/80 hover:text-sidebar-foreground",
            collapsed && "justify-center px-2"
          )}
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span>{isCodeLogin ? "ออกจากระบบ" : "กลับหน้าหลัก"}</span>}
        </Button>
      </div>

      {/* Collapse Toggle (Desktop only) */}
      {!isMobile && (
        <div className="p-3 border-t border-sidebar-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className="w-full justify-center text-sidebar-foreground/60 hover:text-sidebar-foreground"
          >
            <ChevronLeft
              className={cn(
                "w-4 h-4 transition-transform",
                collapsed && "rotate-180"
              )}
            />
          </Button>
        </div>
      )}
    </div>
  );

  // Mobile: Sheet
  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="fixed top-4 left-4 z-50 bg-card shadow-lg"
          >
            <Menu className="w-5 h-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 p-0 bg-sidebar">
          <SidebarContent />
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: Fixed Sidebar
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 80 : 256 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
      className="fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border z-40"
    >
      <SidebarContent />
    </motion.aside>
  );
}
