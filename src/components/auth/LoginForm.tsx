import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";

import { AuthCardShell } from "@/components/auth/AuthCardShell";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { mapAuthErrorMessage, validateEmail, validatePassword } from "@/lib/auth-validation";
import { shouldRedirectToTwoFactor, twoFactorLoginPath } from "@/lib/two-factor-redirect";

type LoginFormProps = React.ComponentProps<"div">;

function safeRedirectPath(value: string | null) {
  if (!value) {
    return "/app/";
  }
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith("/") && !decoded.startsWith("//")) {
      return decoded;
    }
  } catch {
    return "/app/";
  }
  return "/app/";
}

export function LoginForm({ className, ...props }: LoginFormProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setInfoMessage(null);

    const nextEmailError = validateEmail(email);
    const nextPasswordError = validatePassword(password);
    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);

    if (nextEmailError || nextPasswordError) {
      return;
    }

    setIsSubmitting(true);
    const redirectTo = safeRedirectPath(searchParams.get("redirect"));

    const { data, error } = await authClient.signIn.email({
      email: email.trim(),
      password,
      callbackURL: redirectTo,
    });

    setIsSubmitting(false);

    if (error) {
      if (error.status === 403) {
        setInfoMessage(
          "Verify your email before signing in. Check your inbox for a verification link when delivery is configured.",
        );
      } else {
        setFormError(mapAuthErrorMessage(error.message ?? "Sign in failed."));
      }
      return;
    }

    if (shouldRedirectToTwoFactor(data)) {
      navigate(twoFactorLoginPath(redirectTo), { replace: true });
      return;
    }

    // Start a fresh document so the new session cookie and current deployed
    // client build are loaded before the protected app routes run.
    window.location.replace(redirectTo);
  }

  return (
    <div className={cn(className)} {...props}>
      <AuthCardShell>
        <form onSubmit={handleSubmit} noValidate>
          <FieldGroup>
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="text-xs font-semibold tracking-[0.12em] text-primary uppercase">
                Binaries.nl · Email, Organized.
              </p>
              <h1 className="text-2xl font-bold">Sign in</h1>
              <p className="text-balance text-muted-foreground">
                Access the email compose and queue workspace.
              </p>
            </div>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@organization.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? "email-error" : undefined}
                disabled={isSubmitting}
              />
              {emailError ? (
                <FieldDescription id="email-error" className="text-destructive">
                  {emailError}
                </FieldDescription>
              ) : null}
            </Field>
            <Field>
              <div className="flex items-center">
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="ml-auto h-auto px-0 text-muted-foreground"
                  asChild
                >
                  <Link to="/forgot-password/">Forgot your password?</Link>
                </Button>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-invalid={passwordError ? true : undefined}
                aria-describedby={passwordError ? "password-error" : undefined}
                disabled={isSubmitting}
              />
              {passwordError ? (
                <FieldDescription id="password-error" className="text-destructive">
                  {passwordError}
                </FieldDescription>
              ) : null}
            </Field>
            {formError ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {formError}
              </div>
            ) : null}
            {infoMessage ? (
              <div
                role="status"
                className="rounded-md border border-border bg-muted/60 px-3 py-2 text-sm text-muted-foreground"
              >
                {infoMessage}
              </div>
            ) : null}
            <Field>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Signing in…" : "Sign in"}
              </Button>
            </Field>
            <FieldDescription className="text-center text-sm">
              Don&apos;t have an account?{" "}
              <Link to="/register/" className="underline-offset-2 hover:underline">
                Create account
              </Link>
            </FieldDescription>
          </FieldGroup>
        </form>
      </AuthCardShell>
    </div>
  );
}
