import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

export default function Login() {
  const { session, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleSubmit = async (e: FormEvent) => {
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
      setError(otpError.message);
    } else {
      setSuccess(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border border-border shadow-sm">
        <CardHeader className="text-center pb-2 pt-8">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Riunioni in Cloud
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Accedi con la tua email aziendale
          </p>
        </CardHeader>
        <CardContent className="pt-4 pb-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              placeholder="email@azienda.it"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="h-10"
            />
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

          {success && (
            <p className="mt-4 text-sm text-center text-green-600 font-medium">
              Controlla la tua email per il magic link
            </p>
          )}

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
