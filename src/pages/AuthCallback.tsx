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
          try {
            await handlePostAuth(session);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Errore sconosciuto";
            setError("Errore durante la configurazione dell'account: " + msg);
          }
        }
      }
    );

    const timeout = setTimeout(() => {
      setError("Sessione non valida. Riprova il login.");
    }, 10000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate]);

  const handlePostAuth = async (session: { user: { id: string; email?: string; user_metadata?: Record<string, unknown> } }) => {
    const userId = session.user.id;
    const email = session.user.email?.toLowerCase() || "";
    const meta = session.user.user_metadata || {};
    const registrationType = meta.registration_type as string | undefined;

    // 1. Check if user profile already exists
    let { data: profile } = await supabase
      .from("users")
      .select("id, role, tenant_id, full_name, first_login_at, invite_status" as any)
      .eq("id", userId)
      .maybeSingle() as any as { data: { id: string; role: string; tenant_id: string | null; full_name: string; first_login_at: string | null; invite_status: string | null } | null };

    // Try reconciliation by email if not found by id
    if (!profile && email) {
      const { data: emailProfile } = await supabase
        .from("users")
        .select("id, role, tenant_id, full_name, first_login_at, invite_status" as any)
        .eq("email", email)
        .maybeSingle() as any as { data: { id: string; role: string; tenant_id: string | null; full_name: string; first_login_at: string | null; invite_status: string | null } | null };

      if (emailProfile && emailProfile.id !== userId) {
        const { error: updateError } = await supabase
          .from("users")
          .update({ id: userId })
          .eq("id", emailProfile.id);

        if (!updateError) {
          profile = { ...emailProfile, id: userId };
        }
      } else if (emailProfile) {
        profile = emailProfile;
      }
    }

    // 2. Track first login — update first_login_at and invite_status
    if (profile && !profile.first_login_at) {
      await supabase
        .from("users")
        .update({
          first_login_at: new Date().toISOString(),
          invite_status: "active",
        } as any)
        .eq("id", session.user.id);
      // Update local profile reference
      profile = { ...profile, first_login_at: new Date().toISOString(), invite_status: "active" };
    }

    // 3. If profile already has tenant, redirect directly
    if (profile && profile.tenant_id) {
      if (profile.role === "superadmin") {
        navigate("/superadmin/dashboard", { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
      return;
    }

    // 3. If no profile yet and we have registration metadata, handle it now
    if (!profile && registrationType === "create_org") {
      const fullName = (meta.full_name as string) || "";
      const tenantName = (meta.tenant_name as string) || "";
      const vatNumber = (meta.vat_number as string) || "";

      const { error: rpcError } = await supabase.rpc("register_with_new_tenant", {
        p_user_id: userId,
        p_email: email,
        p_full_name: fullName,
        p_tenant_name: tenantName,
        p_vat_number: vatNumber,
      });

      if (rpcError) {
        setError("Errore nella creazione dell'organizzazione: " + rpcError.message);
        return;
      }

      navigate("/dashboard", { replace: true });
      return;
    }

    if (!profile && registrationType === "join_org") {
      const fullName = (meta.full_name as string) || "";
      const tenantId = (meta.tenant_id as string) || "";

      const { data: result, error: rpcError } = await supabase.rpc("register_and_join_tenant", {
        p_user_id: userId,
        p_email: email,
        p_full_name: fullName,
        p_tenant_id: tenantId,
      });

      if (rpcError) {
        setError("Errore nell'invio della richiesta: " + rpcError.message);
        return;
      }

      const resultObj = result as Record<string, unknown> | null;
      if (resultObj?.status === "auto_approved") {
        navigate("/dashboard", { replace: true });
      } else {
        setStatusMessage("Richiesta inviata! L'amministratore della tua organizzazione approvera' il tuo accesso.");
      }
      return;
    }

    // 4. Profile exists but no tenant_id — check for pending join requests
    if (profile && !profile.tenant_id) {
      const { data: joinReq } = await supabase
        .from("join_requests")
        .select("id, status")
        .eq("user_id", userId)
        .eq("status", "pending")
        .maybeSingle();

      if (joinReq) {
        setStatusMessage("La tua richiesta di accesso e' in attesa di approvazione.");
      } else {
        setStatusMessage("Il tuo account e' in attesa di assegnazione a un'organizzazione.");
      }
      return;
    }

    // 5. No profile, no metadata — generic waiting message
    if (!profile) {
      const { data: joinReq } = await supabase
        .from("join_requests")
        .select("id, status")
        .eq("user_id", userId)
        .eq("status", "pending")
        .maybeSingle();

      if (joinReq) {
        setStatusMessage("La tua richiesta di accesso e' in attesa di approvazione.");
      } else {
        setStatusMessage("Il tuo account e' in attesa di assegnazione a un'organizzazione.");
      }
    }
  };

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
