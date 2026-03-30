import { useState, useEffect, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2, Eye, EyeOff, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionDetected, setSessionDetected] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    const handleRecoverySession = async () => {
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.replace("#", "?"));
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const type = params.get("type");

      if (accessToken && refreshToken && type === "recovery") {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!sessionError) {
          setSessionDetected(true);
        } else {
          setError("Sessione di recupero non valida. Richiedi un nuovo link.");
        }
      } else {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          setSessionDetected(true);
        } else {
          setError(
            "Nessuna sessione di recupero trovata. Richiedi un nuovo link di reset dalla pagina di login."
          );
        }
      }
      setCheckingSession(false);
    };

    handleRecoverySession();
  }, []);

  useEffect(() => {
    if (success) {
      const timeout = setTimeout(() => {
        navigate("/login", { replace: true });
      }, 2000);
      return () => clearTimeout(timeout);
    }
  }, [success, navigate]);

  const passwordTooShort = password.length > 0 && password.length < 8;
  const passwordsDoNotMatch =
    confirmPassword.length > 0 && password !== confirmPassword;
  const canSubmit =
    password.length >= 8 &&
    confirmPassword.length > 0 &&
    password === confirmPassword &&
    !loading;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("La password deve contenere almeno 8 caratteri.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Le password non corrispondono.");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (updateError) {
      if (updateError.message.includes("same password")) {
        setError(
          "La nuova password deve essere diversa da quella precedente."
        );
      } else if (updateError.message.includes("Password should be at least")) {
        setError("La password deve contenere almeno 8 caratteri.");
      } else {
        setError(
          "Si è verificato un errore durante il reset della password. Riprova."
        );
      }
    } else {
      setSuccess(true);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border border-border shadow-sm">
        <CardHeader className="text-center pb-2 pt-8">
          <div className="flex items-center justify-center gap-2.5">
            <div className="h-9 w-9 flex items-center justify-center rounded-md bg-foreground text-background font-bold text-base">R</div>
            <span className="text-xl font-semibold tracking-tight text-foreground">Riunioni in Cloud</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {success
              ? "Password aggiornata con successo"
              : "Imposta una nuova password"}
          </p>
        </CardHeader>
        <CardContent className="pt-4 pb-8">
          {success ? (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle
                className="h-10 w-10"
                style={{ color: "hsl(var(--status-done))" }}
              />
              <p
                className="text-sm text-center font-medium"
                style={{ color: "hsl(var(--status-done))" }}
              >
                Password aggiornata! Verrai reindirizzato al login...
              </p>
            </div>
          ) : sessionDetected ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nuova password</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Minimo 8 caratteri"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {passwordTooShort && (
                  <p className="text-xs text-destructive">
                    La password deve contenere almeno 8 caratteri.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">Conferma password</Label>
                <div className="relative">
                  <Input
                    id="confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Ripeti la password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {passwordsDoNotMatch && (
                  <p className="text-xs text-destructive">
                    Le password non corrispondono.
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-10"
                disabled={!canSubmit}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Aggiorna password"
                )}
              </Button>

              {error && (
                <p className="text-sm text-center text-destructive font-medium">
                  {error}
                </p>
              )}
            </form>
          ) : (
            <div className="space-y-4">
              {error && (
                <p className="text-sm text-center text-destructive font-medium">
                  {error}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full h-10"
                onClick={() => navigate("/login", { replace: true })}
              >
                Torna al login
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
