export function hasAdminSession(userId?: string | null): boolean {
  return Boolean(userId) && sessionStorage.getItem("admin_verified") === userId;
}

export function hasAdminCodeSession(userId?: string | null): boolean {
  return hasAdminSession(userId) && sessionStorage.getItem("admin_code_verified") === "true";
}

export function clearAdminSession(): void {
  sessionStorage.removeItem("admin_verified");
  sessionStorage.removeItem("admin_code_verified");
  sessionStorage.removeItem("admin_code_name");
  sessionStorage.removeItem("admin_code_role");
}
