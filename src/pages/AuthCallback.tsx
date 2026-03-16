import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
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

          // If we have a profile with tenant_id, redirect by role
          if (profile && profile.tenant_id) {
            if (profile.role === "superadmin") {
              navigate("/superadmin/dashboard", { replace: true });
            } else {
              navigate("/dashboard", { replace: true });
            }
            return;
          }

          // Profile exists but no tenant_id - check for pending join requests
          if (profile && !profile.tenant_id) {
            const { data: joinReq } = await supabase
              .from("join_requests")
              .select("id, status")
              .eq("user_id", session.user.id)
              .eq("status", "pending")
              .maybeSingle();

            if (joinReq) {
              setStatusMessage("La tua richiesta di accesso e' in attesa di approvazione.");
            } else {
              setStatusMessage("Il tuo account e' in attesa di assegnazione a un'organizzazione.");
            }
            return;
          }

          // No profile at all - check for pending join requests by auth id
          if (!profile) {
            const { data: joinReq } = await supabase
              .from("join_requests")
              .select("id, status")
              .eq("user_auth_id", session.user.id)
              .eq("status", "pending")
              .maybeSingle();

            if (joinReq) {
              setStatusMessage("La tua richiesta di accesso e' in attesa di approvazione.");
            } else {
              setStatusMessage("Il tuo account e' in attesa di assegnazione a un'organizzazione.");
            }
            return;
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

  if (statusMessage) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 px-4">
        <p className="text-sm text-muted-foreground text-center max-w-md">{statusMessage}</p>
        <Button
          variant="outline"
          onClick={async () => {
            await supabase.auth.signOut();
            navigate("/login", { replace: true });
          }}
        >
          Torna al login
        </Button>
      </div>
    );
  }

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
        <p className="text-sm text-muted-foreground">Autenticazione in corso...</p>
      </div>
    </div>
  );
}
