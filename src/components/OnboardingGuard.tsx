import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Blocks access to app routes until the org_admin completes onboarding.
 * Non-admin roles pass through (they can't fill onboarding anyway).
 */
export default function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["tenant-onboarding", user?.tenant_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("onboarding_completed_at")
        .eq("id", user!.tenant_id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.tenant_id && user?.role === "org_admin",
  });

  // Non-admins or loading: pass through
  if (user?.role !== "org_admin" || isLoading) {
    return <>{children}</>;
  }

  // Admin but onboarding not completed
  if (tenant && !(tenant as any).onboarding_completed_at) {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}
