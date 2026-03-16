import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Exchange the code/token from the URL
        const { data: { session }, error: sessionError } =
          await supabase.auth.getSession();

        if (sessionError || !session) {
          setError("Sessione non valida. Riprova il login.");
          return;
        }

        // Fetch user profile
        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("role, tenant_id, full_name")
          .eq("id", session.user.id)
          .maybeSingle();

        if (profileError || !profile) {
          setError("Account non autorizzato");
          await supabase.auth.signOut();
          return;
        }

        // Redirect by role
        if (profile.role === "superadmin") {
          navigate("/superadmin/dashboard", { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
      } catch {
        setError("Errore durante l'autenticazione");
      }
    };

    handleCallback();
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
