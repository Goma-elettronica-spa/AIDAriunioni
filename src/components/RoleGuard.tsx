import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

/** Redirects users who don't have one of the allowed roles */
export default function RoleGuard({
  allowed,
  children,
}: {
  allowed: string[];
  children: React.ReactNode;
}) {
  const { user } = useAuth();

  if (user && !allowed.includes(user.role)) {
    return <Navigate to={user.role === "superadmin" ? "/superadmin/dashboard" : "/dashboard"} replace />;
  }

  return <>{children}</>;
}
