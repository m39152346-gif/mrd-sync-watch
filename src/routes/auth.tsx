import { useI18n, LanguageToggle } from "@/lib/i18n";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "description",
        content:
          "Optional SyncWatch account so your display name follows you between watch parties.",
      },
      { property: "og:title", content: "Account — SyncWatch" },
      {
        property: "og:description",
        content:
          "Sign in or sign up to save your SyncWatch display name. Guests can skip this entirely.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { t, lang } = useI18n();
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
      toast.error(t("error.signIn"));
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
      toast.error(t("error.pickName"));
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
      toast.error(t("error.signUp"));
      return;
    }
    setStoredName(displayName.trim());
    toast.success(t("checkEmail"));
  };

  return (
    <main className="bg-stage flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex justify-end">
          <LanguageToggle />
        </div>
        <div className="text-center">
          <h1 className="text-gradient text-3xl font-bold"> {t("auth.title")} </h1>
          <p className="mt-1 text-sm text-muted-foreground"> {t("auth.subtitle")}</p>
        </div>
        <Tabs
          dir={lang === "fa" ? "rtl" : "ltr"}
          defaultValue="signin"
          className="rounded-2xl border border-border bg-card p-5"
        >
          <TabsList className="w-full">
            <TabsTrigger value="signin" className="flex-1">
              {" "}
              {t("signIn")}
            </TabsTrigger>
            <TabsTrigger value="signup" className="flex-1">
              {" "}
              {t("signUp")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="signin" className="mt-4">
            <form onSubmit={signIn} className="space-y-3">
              <Input
                type="email"
                dir="ltr"
                aria-label={t("email.label")}
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
              <Input
                type="password"
                aria-label={t("password.placeholder")}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("password.placeholder")}
              />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />} {t("signIn")}
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="signup" className="mt-4">
            <form onSubmit={signUp} className="space-y-3">
              <Input
                value={displayName}
                maxLength={24}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={t("displayNamePlaceholder")}
              />
              <Input
                type="email"
                dir="ltr"
                aria-label={t("email.label")}
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
              <Input
                type="password"
                aria-label={t("password.placeholder")}
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t("password.placeholder")}
              />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />} {t("createAccountBtn")}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
        <p className="text-center text-xs text-muted-foreground">
          <Link to="/" className="text-primary underline-offset-2 hover:underline">
            {" "}
            {t("backToRooms")}
          </Link>
        </p>
      </div>
    </main>
  );
}
