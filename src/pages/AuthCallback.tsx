import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Listen for the auth state change triggered by the URL hash/code
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session) {
          // Fetch user profile
          let { data: profile } = await supabase
            .from("users")
            .select("id, role, tenant_id, full_name")
            .eq("id", session.user.id)
            .maybeSingle();

          // Try reconciliation by email if not found by id
          if (!profile && session.user.email) {
            const { data: emailProfile } = await supabase
              .from("users")
              .select("id, role, tenant_id, full_name")
              .eq("email", session.user.email.toLowerCase())
              .maybeSingle();

            if (emailProfile && emailProfile.id !== session.user.id) {
              const { error: updateError } = await supabase
                .from("users")
                .update({ id: session.user.id })
                .eq("id", emailProfile.id);

              if (!updateError) {
                profile = { ...emailProfile, id: session.user.id };
              }
            } else if (emailProfile) {
              profile = emailProfile;
            }
          }

          if (!profile) {
            setError("Account non autorizzato");
            await supabase.auth.signOut();
            return;
          }

          if (profile.role === "superadmin") {
            navigate("/superadmin/dashboard", { replace: true });
          } else {
            navigate("/dashboard", { replace: true });
          }
        }
      }
    );

    // Fallback timeout in case no auth event fires
    const timeout = setTimeout(() => {
      setError("Sessione non valida. Riprova il login.");
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <p className="text-destructive font-medium">{error}</p>
        <Button variant="outline" onClick={() => navigate("/login", { replace: true })}>
          Torna al login
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Autenticazione in corso…</p>
      </div>
    </div>
  );
}
