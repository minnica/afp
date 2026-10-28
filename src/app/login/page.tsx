"use client";

import type { FormEvent } from "react";
import { errorMessage } from "@/lib/uiTypes";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureUserSetup } from "@/lib/userSetup";
import { RequestError } from "@/lib/requestErrors";
import { getRecoveryScope, recoverRequest } from "@/lib/requestRecovery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;
    const requestScope = getRecoveryScope();

    setIsLoading(true);
    setMessage("");
    setError("");

    try {
      if (mode === "login") {
        const signIn = async () => {
          const result = await supabase.auth.signInWithPassword({ email, password });
          if (result.error) {
            if (!result.error.status || result.error.status >= 500 || result.error.status === 429) {
              throw new RequestError("Revisa tu conexión e inténtalo de nuevo.", {
                title: "No pudimos iniciar sesión", retryable: true,
              });
            }
            throw new Error(result.error.code === "invalid_credentials"
              ? "El correo o la contraseña no son correctos." : result.error.message);
          }
          return result;
        };
        let result;
        try {
          result = await signIn();
        } catch (error) {
          if (!(error instanceof RequestError) || !error.retryable) throw error;
          result = await recoverRequest(error, signIn, { requestScope });
        }
        const { data } = result;

        await ensureUserSetup(data.user);

        router.push("/dashboard");
        router.refresh();
      }

      if (mode === "register") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        setMessage("Cuenta creada. Revisa tu correo si Supabase pide confirmación.");
      }
    } catch (err) {
      setError(errorMessage(err) || "Ocurrió un error.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <Card className="w-full max-w-md rounded-2xl border-border bg-card">
        <CardHeader>
          <p className="text-sm text-muted-foreground">AFP</p>
          <CardTitle className="text-2xl">
            {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
          </CardTitle>
          <CardDescription>
            Accede a tu control de gastos personales.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                placeholder="Mínimo 6 caracteres"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                disabled={isLoading}
              />
            </div>

            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            {message ? (
              <Alert role="status">
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            ) : null}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Spinner /> : null}
              {isLoading
                ? "Procesando..."
                : mode === "login"
                  ? "Entrar"
                  : "Crear cuenta"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "login" ? (
              <>
                ¿No tienes cuenta?{" "}
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-sm"
                  disabled={isLoading}
                  onClick={() => {
                    setMode("register");
                    setError("");
                    setMessage("");
                  }}
                >
                  Crear cuenta
                </Button>
              </>
            ) : (
              <>
                ¿Ya tienes cuenta?{" "}
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-sm"
                  disabled={isLoading}
                  onClick={() => {
                    setMode("login");
                    setError("");
                    setMessage("");
                  }}
                >
                  Iniciar sesión
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
