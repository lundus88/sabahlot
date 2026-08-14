"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import styles from "../auth.module.css";

type SessionState = "checking" | "ready" | "missing";

export default function ResetPasswordPage() {
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const checkSession = async () => {
      const { data } = await supabase.auth.getUser();

      if (active) {
        setSessionState(data.user ? "ready" : "missing");
      }
    };

    void checkSession();

    return () => {
      active = false;
    };
  }, []);

  const submitNewPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");

    if (password !== confirmPassword) {
      setErrorMessage("Kata laluan baharu tidak sepadan.");
      return;
    }

    setBusy(true);

    const supabase = createClient();

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMessage(error.message);
    } else {
      setMessage(
        "Kata laluan berjaya dikemas kini. Anda kini log masuk dengan kata laluan baharu.",
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
            <span className={styles.mark}>SL</span>
            <span>
              <strong>SabahLot</strong>
              <small>Alpha</small>
            </span>
          </div>

          <Link href="/" className={styles.mapLink}>
            Kembali ke peta
          </Link>
        </header>

        <div className={styles.intro}>
          <span className={styles.eyebrow}>SabahLot powered by Myukur</span>
          <h1>Tetapkan Kata Laluan Baharu</h1>
          <p>
            Masukkan kata laluan baharu untuk akaun SabahLot anda.
          </p>
        </div>

        {sessionState === "checking" && (
          <p className={styles.success} role="status">
            Menyemak pautan reset...
          </p>
        )}

        {sessionState === "missing" && (
          <p className={styles.error} role="alert">
            Pautan reset tidak sah atau telah tamat tempoh. Sila mohon
            pautan reset baharu daripada halaman log masuk.
          </p>
        )}

        {sessionState === "ready" && !message && (
          <form className={styles.form} onSubmit={submitNewPassword}>
            <label>
              <span>Kata laluan baharu</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </label>

            <label>
              <span>Sahkan kata laluan baharu</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
              />
            </label>

            <button type="submit" disabled={busy}>
              {busy ? "Memproses..." : "Kemas kini kata laluan"}
            </button>
          </form>
        )}

        {message && (
          <p className={styles.success} role="status">
            {message}
          </p>
        )}

        {errorMessage && sessionState === "ready" && (
          <p className={styles.error} role="alert">
            {errorMessage}
          </p>
        )}

        {message && (
          <Link href="/" className={styles.mapLink}>
            Ke peta
          </Link>
        )}

        <footer className={styles.footer}>
          SabahLot powered by Myukur · Preliminary Alpha
        </footer>
      </section>
    </main>
  );
}
