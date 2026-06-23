"use client";

import Link from "next/link";
import {
  type FormEvent,
  useEffect,
  useState,
} from "react";

import {
  createClient,
} from "@/lib/supabase/client";

import styles from "./auth.module.css";

type AuthMode =
  | "login"
  | "signup";

function callbackUrl() {
  return `${window.location.origin}/auth/callback`;
}

export default function AuthPage() {
  const [
    mode,
    setMode,
  ] = useState<AuthMode>("login");

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    currentEmail,
    setCurrentEmail,
  ] = useState<string | null>(
    null,
  );

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    busy,
    setBusy,
  ] = useState(false);

  const [
    oauthBusy,
    setOauthBusy,
  ] = useState(false);

  useEffect(() => {
    const supabase =
      createClient();

    let active =
      true;

    const loadUser =
      async () => {
        const {
          data,
        } =
          await supabase.auth.getUser();

        if (active) {
          setCurrentEmail(
            data.user?.email ??
              null,
          );
        }
      };

    void loadUser();

    const {
      data: {
        subscription,
      },
    } =
      supabase.auth.onAuthStateChange(
        (
          _event,
          session,
        ) => {
          setCurrentEmail(
            session?.user.email ??
              null,
          );
        },
      );

    const authStatus =
      new URLSearchParams(
        window.location.search,
      ).get("auth");

    if (
      authStatus ===
      "confirmed"
    ) {
      window.setTimeout(
        () => {
          setMessage(
            "Email berjaya disahkan. Sesi SabahLot anda kini aktif.",
          );
        },
        0,
      );
    }

    if (
      authStatus ===
      "callback-error"
    ) {
      window.setTimeout(
        () => {
          setErrorMessage(
            "Google Login tidak dapat diselesaikan. Sila cuba lagi.",
          );
        },
        0,
      );
    }

    return () => {
      active =
        false;

      subscription.unsubscribe();
    };
  }, []);

  const clearFeedback =
    () => {
      setMessage("");
      setErrorMessage("");
    };

  const signInWithGoogle =
    async () => {
      clearFeedback();
      setOauthBusy(true);

      try {
        const supabase =
          createClient();

        const {
          error,
        } =
          await supabase.auth.signInWithOAuth({
            provider:
              "google",
            options: {
              redirectTo:
                callbackUrl(),
            },
          });

        if (error) {
          setErrorMessage(
            "Google Login tidak dapat dimulakan. Sila cuba lagi.",
          );

          setOauthBusy(false);
        }
      } catch {
        setErrorMessage(
          "Tidak dapat menghubungi Google Login. Semak sambungan anda dan cuba lagi.",
        );

        setOauthBusy(false);
      }
    };

  const submitCredentials =
    async (
      event:
        FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();
      clearFeedback();
      setBusy(true);

      const supabase =
        createClient();

      if (
        mode ===
        "signup"
      ) {
        const {
          data,
          error,
        } =
          await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo:
                callbackUrl(),
            },
          });

        if (error) {
          setErrorMessage(
            error.message,
          );
        } else if (
          data.session
        ) {
          setMessage(
            "Akaun berjaya dicipta dan sesi anda kini aktif.",
          );
        } else {
          setMessage(
            "Akaun berjaya didaftarkan. Semak email anda untuk pengesahan.",
          );
        }
      } else {
        const {
          error,
        } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (error) {
          setErrorMessage(
            error.message,
          );
        } else {
          setMessage(
            "Log masuk berjaya.",
          );
        }
      }

      setBusy(false);
    };

  const signOut =
    async () => {
      clearFeedback();
      setBusy(true);

      const supabase =
        createClient();

      const {
        error,
      } =
        await supabase.auth.signOut();

      if (error) {
        setErrorMessage(
          error.message,
        );
      } else {
        setMessage(
          "Anda telah log keluar.",
        );
      }

      setBusy(false);
    };

  return (
    <main className={styles.page}>
      <div className={styles.glow} />

      <section className={styles.card}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.mark}>
              SL
            </span>

            <span>
              <strong>
                SabahLot
              </strong>

              <small>
                Alpha
              </small>
            </span>
          </div>

          <Link
            href="/"
            className={styles.mapLink}
          >
            Kembali ke peta
          </Link>
        </header>

        <div className={styles.intro}>
          <span className={styles.eyebrow}>
            SabahLot powered by Myukur
          </span>

          <h1>
            Akses SabahLot
          </h1>

          <p>
            Akses rekod awal SabahLot
            untuk rujukan dan
            perancangan sahaja.
          </p>

          <p>
            Preliminary output only. This is not a legal survey plan,
            not proof of land boundary, and not an official approval
            by JTU, Land Office, or any authority. Final boundary
            and land matters must be verified through the proper
            Sabah land and survey procedures.
          </p>
        </div>

        {currentEmail ? (
          <section className={styles.session}>
            <span>
              Sesi aktif
            </span>

            <strong>
              {currentEmail}
            </strong>

            <button
              type="button"
              onClick={signOut}
              disabled={busy}
            >
              {busy
                ? "Memproses..."
                : "Log keluar"}
            </button>
          </section>
        ) : (
          <>
            <button
              type="button"
              className={styles.googleButton}
              onClick={
                signInWithGoogle
              }
              disabled={
                oauthBusy ||
                busy
              }
            >
              {oauthBusy ? (
                <span
                  className={styles.spinner}
                  aria-hidden="true"
                />
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fill="#4285F4"
                    d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.4 3-7.4Z"
                  />

                  <path
                    fill="#34A853"
                    d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1a5.8 5.8 0 0 1-5.5-4H3.2v2.6A10 10 0 0 0 12 22Z"
                  />

                  <path
                    fill="#FBBC05"
                    d="M6.5 14.1a6 6 0 0 1 0-4.2V7.3H3.2a10 10 0 0 0 0 9.4l3.3-2.6Z"
                  />

                  <path
                    fill="#EA4335"
                    d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.8A9.7 9.7 0 0 0 3.2 7.3l3.3 2.6A5.8 5.8 0 0 1 12 5.9Z"
                  />
                </svg>
              )}

              <span>
                {oauthBusy
                  ? "Membuka Google..."
                  : "Teruskan dengan Google"}
              </span>
            </button>

            <div className={styles.divider}>
              <span>
                atau gunakan e-mel
              </span>
            </div>

            <div className={styles.tabs}>
              <button
                type="button"
                className={
                  mode === "login"
                    ? styles.activeTab
                    : ""
                }
                onClick={() => {
                  clearFeedback();
                  setMode("login");
                }}
              >
                Log masuk
              </button>

              <button
                type="button"
                className={
                  mode === "signup"
                    ? styles.activeTab
                    : ""
                }
                onClick={() => {
                  clearFeedback();
                  setMode("signup");
                }}
              >
                Daftar akaun
              </button>
            </div>

            <form
              className={styles.form}
              onSubmit={
                submitCredentials
              }
            >
              <label>
                <span>
                  Alamat email
                </span>

                <input
                  type="email"
                  value={email}
                  onChange={(
                    event,
                  ) =>
                    setEmail(
                      event.target.value,
                    )
                  }
                  autoComplete="email"
                  required
                />
              </label>

              <label>
                <span>
                  Kata laluan
                </span>

                <input
                  type="password"
                  value={password}
                  onChange={(
                    event,
                  ) =>
                    setPassword(
                      event.target.value,
                    )
                  }
                  autoComplete={
                    mode === "signup"
                      ? "new-password"
                      : "current-password"
                  }
                  minLength={6}
                  required
                />
              </label>

              <button
                type="submit"
                disabled={
                  busy ||
                  oauthBusy
                }
              >
                {busy
                  ? "Memproses..."
                  : mode ===
                      "signup"
                    ? "Daftar dan sahkan email"
                    : "Log masuk"}
              </button>
            </form>
          </>
        )}

        {message && (
          <p
            className={styles.success}
            role="status"
          >
            {message}
          </p>
        )}

        {errorMessage && (
          <p
            className={styles.error}
            role="alert"
          >
            {errorMessage}
          </p>
        )}

        <footer className={styles.footer}>
          SabahLot powered by Myukur · Preliminary Alpha
        </footer>
      </section>
    </main>
  );
}
