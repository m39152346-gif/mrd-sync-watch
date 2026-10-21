import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { setStoredName } from "@/lib/session";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Account — SyncWatch" },
      {
        name: "description",
        content: "Optional SyncWatch account so your display name follows you between watch parties.",
      },
      { property: "og:title", content: "Account — SyncWatch" },
      {
        property: "og:description",
        content: "Sign in or sign up to save your SyncWatch display name. Guests can skip this entirely.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error || !data.user) {
      toast.error(error?.message ?? "Sign in could not be completed.");
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", data.user.id)
      .maybeSingle();
    if (profile?.display_name) setStoredName(profile.display_name);
    navigate({ to: "/" });
  };

  const signUp = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!displayName.trim()) {
      toast.error("Pick a display name.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName.trim() },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setStoredName(displayName.trim());
    toast.success("Check your email to confirm your account.");
  };

  return (
    <main className="bg-stage flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <h1 className="text-gradient text-3xl font-bold">SyncWatch account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Optional — guests can join any room without signing up.
          </p>
        </div>
        <Tabs defaultValue="signin" className="rounded-2xl border border-border bg-card p-5">
          <TabsList className="w-full">
            <TabsTrigger value="signin" className="flex-1">
              Sign in
            </TabsTrigger>
            <TabsTrigger value="signup" className="flex-1">
              Sign up
            </TabsTrigger>
          </TabsList>
          <TabsContent value="signin" className="mt-4">
            <form onSubmit={signIn} className="space-y-3">
              <Input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
              <Input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
              />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />} Sign in
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="signup" className="mt-4">
            <form onSubmit={signUp} className="space-y-3">
              <Input
                value={displayName}
                maxLength={24}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Display name"
              />
              <Input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
              <Input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
              />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />} Create account
              </Button>
            </form>
          </TabsContent>
        </Tabs>
        <p className="text-center text-xs text-muted-foreground">
          <Link to="/" className="text-primary underline-offset-2 hover:underline">
            Back to rooms
          </Link>
        </p>
      </div>
    </main>
  );
}
