import { useState, useEffect, useRef, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

type View = "login" | "magic-link" | "forgot-password";

function translateError(message: string): string {
  if (message.includes("Email rate limit exceeded")) {
    return "rate_limit";
  }
  if (message.includes("Invalid login credentials")) {
    return "Email o password non corretti";
  }
  if (message.includes("Email not confirmed")) {
    return "Email non ancora confermata. Controlla la tua casella di posta.";
  }
  if (message.includes("User not found")) {
    return "Nessun account trovato con questa email.";
  }
  if (message.includes("Too many requests")) {
    return "rate_limit";
  }
  if (message.includes("Signup disabled")) {
    return "La registrazione è disabilitata. Contatta l'amministratore.";
  }
  if (message.includes("User already registered")) {
    return "Questa email è già registrata.";
  }
  if (message.includes("Password should be at least")) {
    return "La password deve contenere almeno 6 caratteri.";
  }
  return "Si è verificato un errore. Riprova più tardi.";
}

const RATE_LIMIT_SECONDS = 60;

export default function Login() {
  const { session, loading: authLoading } = useAuth();
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (rateLimitCountdown <= 0) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      return;
    }
    countdownRef.current = setInterval(() => {
      setRateLimitCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          countdownRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [rateLimitCountdown]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  function startRateLimitCountdown() {
    setRateLimitCountdown(RATE_LIMIT_SECONDS);
  }

  function handleError(errorMessage: string) {
    const translated = translateError(errorMessage);
    if (translated === "rate_limit") {
      startRateLimitCountdown();
      setError(null);
    } else {
      setError(translated);
    }
  }

  function switchView(newView: View) {
    setView(newView);
    setError(null);
    setSuccess(false);
  }

  const handlePasswordLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (signInError) {
      handleError(signInError.message);
    }
  };

  const handleMagicLink = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);

    if (otpError) {
      handleError(otpError.message);
    } else {
      setSuccess(true);
    }
  };

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      }
    );

    setLoading(false);

    if (resetError) {
      handleError(resetError.message);
    } else {
      setSuccess(true);
    }
  };

  const subtitle =
    view === "login"
      ? "Accedi con le tue credenziali"
      : view === "magic-link"
        ? "Ricevi un link di accesso via email"
        : "Inserisci la tua email per reimpostare la password";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border border-border shadow-sm">
        <CardHeader className="text-center pb-2 pt-8">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Riunioni in Cloud
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </CardHeader>
        <CardContent className="pt-4 pb-8">
          {view !== "login" && (
            <button
              type="button"
              onClick={() => switchView("login")}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Torna al login
            </button>
          )}

          {/* Password Login View */}
          {view === "login" && (
            <>
              <form onSubmit={handlePasswordLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="email@azienda.it"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => switchView("forgot-password")}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Password dimenticata?
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Inserisci la password"
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
                </div>
                <Button
                  type="submit"
                  className="w-full h-10"
                  disabled={loading || !email.trim() || !password}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Accedi"
                  )}
                </Button>
              </form>

              <div className="flex items-center gap-3 my-5">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">oppure</span>
                <Separator className="flex-1" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full h-10"
                onClick={() => switchView("magic-link")}
                disabled={loading}
              >
                Accedi con Magic Link
              </Button>
            </>
          )}

          {/* Magic Link View */}
          {view === "magic-link" && (
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="magic-email">Email</Label>
                <Input
                  id="magic-email"
                  type="email"
                  placeholder="email@azienda.it"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="h-10"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-10"
                disabled={loading || !email.trim()}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Invia Magic Link"
                )}
              </Button>
            </form>
          )}

          {/* Forgot Password View */}
          {view === "forgot-password" && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="email@azienda.it"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="h-10"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-10"
                disabled={loading || !email.trim()}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Invia link di reset"
                )}
              </Button>
            </form>
          )}

          {/* Rate Limit Countdown */}
          {rateLimitCountdown > 0 && (
            <div className="mt-4 rounded-md bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 p-3">
              <p className="text-sm text-center text-orange-700 dark:text-orange-400 font-medium">
                Troppe richieste. Riprova tra {rateLimitCountdown}{" "}
                {rateLimitCountdown === 1 ? "secondo" : "secondi"}.
              </p>
            </div>
          )}

          {/* Success Messages */}
          {success && view === "magic-link" && (
            <p
              className="mt-4 text-sm text-center font-medium"
              style={{ color: "hsl(var(--status-done))" }}
            >
              Controlla la tua email per il magic link
            </p>
          )}

          {success && view === "forgot-password" && (
            <p
              className="mt-4 text-sm text-center font-medium"
              style={{ color: "hsl(var(--status-done))" }}
            >
              Email inviata! Controlla la tua casella di posta per il link di
              reset.
            </p>
          )}

          {/* Error Message */}
          {error && (
            <p className="mt-4 text-sm text-center text-destructive font-medium">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
