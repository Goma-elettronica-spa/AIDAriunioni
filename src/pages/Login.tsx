import { useState, useEffect, useRef, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Eye, EyeOff, ArrowLeft, Search } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

type View = "login" | "register" | "magic-link" | "forgot-password";

function translateError(message: string): string {
  if (message.includes("Email rate limit exceeded")) {
    return "rate_limit";
  }
  if (message.includes("Too many requests")) {
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
  if (message.includes("Signup disabled")) {
    return "La registrazione e' disabilitata. Contatta l'amministratore.";
  }
  if (message.includes("User already registered")) {
    return "Questa email e' gia' registrata. Prova ad accedere.";
  }
  if (message.includes("Password should be at least")) {
    return "La password deve contenere almeno 6 caratteri.";
  }
  return "Si e' verificato un errore. Riprova piu' tardi.";
}

const RATE_LIMIT_SECONDS = 60;

export default function Login() {
  const { session, loading: authLoading } = useAuth();
  const [view, setView] = useState<View>("login");

  // Login fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Register fields
  const [regStep, setRegStep] = useState<1 | 2>(1);
  const [regFullName, setRegFullName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [orgChoice, setOrgChoice] = useState<"create" | "join">("create");
  const [orgName, setOrgName] = useState("");
  const [orgVat, setOrgVat] = useState("");
  const [joinVat, setJoinVat] = useState("");
  const [foundTenants, setFoundTenants] = useState<{ id: string; name: string; vat_number: string }[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<{ id: string; name: string; vat_number: string } | null>(null);
  const [tenantSearchDone, setTenantSearchDone] = useState(false);

  // Common state
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
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
    setSuccessMessage("");
    if (newView === "register") {
      setRegStep(1);
      setFoundTenants([]);
      setSelectedTenant(null);
      setTenantSearchDone(false);
    }
  }

  function resetRegister() {
    setRegStep(1);
    setRegFullName("");
    setRegEmail("");
    setRegPassword("");
    setRegConfirmPassword("");
    setShowRegPassword(false);
    setShowRegConfirmPassword(false);
    setOrgChoice("create");
    setOrgName("");
    setOrgVat("");
    setJoinVat("");
    setFoundTenants([]);
    setSelectedTenant(null);
    setTenantSearchDone(false);
  }

  // ---- Login handler ----
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

  // ---- Magic Link handler ----
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
      setSuccessMessage("Controlla la tua email per il magic link");
    }
  };

  // ---- Forgot Password handler ----
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
      setSuccessMessage("Email inviata! Controlla la tua casella per il link di reset.");
    }
  };

  // ---- Register Step 1 validation ----
  const handleRegStep1 = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (regPassword.length < 8) {
      setError("La password deve contenere almeno 8 caratteri.");
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setError("Le password non coincidono.");
      return;
    }

    setRegStep(2);
  };

  // ---- Search tenant by VAT or name ----
  const handleSearchTenant = async () => {
    setError(null);
    setFoundTenants([]);
    setSelectedTenant(null);
    setTenantSearchDone(false);
    setLoading(true);

    const { data: rpcData, error: searchError } = await supabase.rpc("search_tenant_by_vat", { p_query: joinVat.trim() });

    setLoading(false);
    setTenantSearchDone(true);

    if (searchError) {
      setError("Errore nella ricerca. Riprova.");
      return;
    }

    setFoundTenants(rpcData || []);
  };

  // ---- Create new org registration ----
  const handleCreateOrgRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    // 1. Sign up the user
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: regEmail.trim().toLowerCase(),
      password: regPassword,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signUpError) {
      setLoading(false);
      handleError(signUpError.message);
      return;
    }

    const userId = signUpData.user?.id;
    if (!userId) {
      setLoading(false);
      setError("Errore nella creazione dell'account. Riprova.");
      return;
    }

    // 2. Create tenant and user profile via RPC
    const { data: result, error: rpcError } = await supabase.rpc("register_with_new_tenant", {
      p_user_id: userId,
      p_email: regEmail.trim(),
      p_full_name: regFullName.trim(),
      p_tenant_name: orgName.trim(),
      p_vat_number: orgVat.trim(),
    });

    setLoading(false);

    if (rpcError) {
      setError("Errore nella creazione dell'organizzazione: " + rpcError.message);
      return;
    }

    setSuccess(true);
    setSuccessMessage("Account creato! Controlla la tua email per confermare la registrazione.");
    resetRegister();
  };

  // ---- Join existing org registration ----
  const handleJoinOrgRegister = async () => {
    if (!selectedTenant) return;
    setError(null);
    setSuccess(false);
    setLoading(true);

    // 1. Sign up the user
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: regEmail.trim().toLowerCase(),
      password: regPassword,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signUpError) {
      setLoading(false);
      handleError(signUpError.message);
      return;
    }

    const userId = signUpData.user?.id;
    if (!userId) {
      setLoading(false);
      setError("Errore nella creazione dell'account. Riprova.");
      return;
    }

    // 2. Register and join tenant via RPC
    const { data: result, error: joinRpcError } = await supabase.rpc("register_and_join_tenant", {
      p_user_id: userId,
      p_email: regEmail.trim(),
      p_full_name: regFullName.trim(),
      p_tenant_id: selectedTenant.id,
    });

    setLoading(false);

    if (joinRpcError) {
      setError("Errore nell'invio della richiesta: " + joinRpcError.message);
      return;
    }

    setSuccess(true);
    const resultObj = result as Record<string, unknown> | null;
    if (resultObj?.status === "auto_approved") {
      setSuccessMessage("Accesso approvato! Effettua il login.");
    } else if (resultObj?.status === "pending") {
      setSuccessMessage("Richiesta inviata! L'amministratore della tua organizzazione approvera' il tuo accesso.");
    } else {
      setSuccessMessage("Registrazione completata! Controlla la tua email per confermare.");
    }
    resetRegister();
  };

  // ---- Subtitles ----
  const subtitle =
    view === "login"
      ? "Accedi con le tue credenziali"
      : view === "register"
        ? regStep === 1
          ? "Crea il tuo account"
          : "Scegli la tua organizzazione"
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
          {/* Back to login arrow */}
          {view !== "login" && (
            <button
              type="button"
              onClick={() => {
                switchView("login");
                resetRegister();
              }}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Torna al login
            </button>
          )}

          {/* ==================== LOGIN VIEW ==================== */}
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

              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10"
                  onClick={() => switchView("magic-link")}
                  disabled={loading}
                >
                  Accedi con Magic Link
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  className="w-full h-10 text-muted-foreground"
                  onClick={() => switchView("register")}
                  disabled={loading}
                >
                  Non hai un account? Registrati
                </Button>
              </div>
            </>
          )}

          {/* ==================== REGISTER VIEW ==================== */}
          {view === "register" && regStep === 1 && (
            <form onSubmit={handleRegStep1} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reg-name">Nome Completo</Label>
                <Input
                  id="reg-name"
                  type="text"
                  placeholder="Mario Rossi"
                  value={regFullName}
                  onChange={(e) => setRegFullName(e.target.value)}
                  required
                  disabled={loading}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-email">Email</Label>
                <Input
                  id="reg-email"
                  type="email"
                  placeholder="email@azienda.it"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-password">Password</Label>
                <div className="relative">
                  <Input
                    id="reg-password"
                    type={showRegPassword ? "text" : "password"}
                    placeholder="Minimo 8 caratteri"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                    minLength={8}
                    disabled={loading}
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegPassword(!showRegPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showRegPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-confirm-password">Conferma Password</Label>
                <div className="relative">
                  <Input
                    id="reg-confirm-password"
                    type={showRegConfirmPassword ? "text" : "password"}
                    placeholder="Ripeti la password"
                    value={regConfirmPassword}
                    onChange={(e) => setRegConfirmPassword(e.target.value)}
                    required
                    minLength={8}
                    disabled={loading}
                    className="h-10 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showRegConfirmPassword ? (
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
                disabled={
                  loading ||
                  !regFullName.trim() ||
                  !regEmail.trim() ||
                  !regPassword ||
                  !regConfirmPassword
                }
              >
                Avanti
              </Button>
            </form>
          )}

          {view === "register" && regStep === 2 && (
            <div className="space-y-5">
              <RadioGroup
                value={orgChoice}
                onValueChange={(val) => {
                  setOrgChoice(val as "create" | "join");
                  setError(null);
                  setFoundTenants([]);
                  setSelectedTenant(null);
                  setTenantSearchDone(false);
                }}
                className="space-y-3"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="create" id="org-create" />
                  <Label htmlFor="org-create" className="cursor-pointer font-medium">
                    Crea una nuova organizzazione
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="join" id="org-join" />
                  <Label htmlFor="org-join" className="cursor-pointer font-medium">
                    Unisciti a un'organizzazione esistente
                  </Label>
                </div>
              </RadioGroup>

              {/* Create new org form */}
              {orgChoice === "create" && (
                <form onSubmit={handleCreateOrgRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="org-name">Nome Organizzazione</Label>
                    <Input
                      id="org-name"
                      type="text"
                      placeholder="La Mia Azienda S.r.l."
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      required
                      disabled={loading}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-vat">P.IVA</Label>
                    <Input
                      id="org-vat"
                      type="text"
                      placeholder="12345678901"
                      value={orgVat}
                      onChange={(e) => setOrgVat(e.target.value)}
                      required
                      disabled={loading}
                      className="h-10"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-10"
                    disabled={loading || !orgName.trim() || !orgVat.trim()}
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Registrati"
                    )}
                  </Button>
                </form>
              )}

              {/* Join existing org */}
              {orgChoice === "join" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="join-vat">Cerca per nome o P.IVA</Label>
                    <div className="flex gap-2">
                      <Input
                        id="join-vat"
                        type="text"
                        placeholder="12345678901"
                        value={joinVat}
                        onChange={(e) => {
                          setJoinVat(e.target.value);
                          setFoundTenants([]);
                          setSelectedTenant(null);
                          setTenantSearchDone(false);
                        }}
                        disabled={loading}
                        className="h-10 flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10"
                        onClick={handleSearchTenant}
                        disabled={loading || !joinVat.trim()}
                      >
                        {loading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                        <span className="ml-1.5">Cerca</span>
                      </Button>
                    </div>
                  </div>

                  {tenantSearchDone && foundTenants.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      Nessuna organizzazione trovata
                    </p>
                  )}

                  {foundTenants.length > 0 && (
                    <div className="space-y-2">
                      {foundTenants.map((tenant) => (
                        <div
                          key={tenant.id}
                          onClick={() => setSelectedTenant(tenant)}
                          className={`rounded-md border p-3 cursor-pointer transition-colors ${
                            selectedTenant?.id === tenant.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <p className="text-sm font-medium">{tenant.name}</p>
                          <p className="text-xs text-muted-foreground">P.IVA: {tenant.vat_number}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedTenant && (
                    <Button
                      type="button"
                      className="w-full h-10"
                      onClick={handleJoinOrgRegister}
                      disabled={loading}
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Richiedi Accesso"
                      )}
                    </Button>
                  )}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full h-10"
                onClick={() => {
                  setRegStep(1);
                  setError(null);
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Indietro
              </Button>
            </div>
          )}

          {/* ==================== MAGIC LINK VIEW ==================== */}
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

          {/* ==================== FORGOT PASSWORD VIEW ==================== */}
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
          {success && successMessage && (
            <p
              className="mt-4 text-sm text-center font-medium"
              style={{ color: "hsl(var(--status-done))" }}
            >
              {successMessage}
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
