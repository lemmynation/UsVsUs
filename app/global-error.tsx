"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-errors";

/** Last-resort screen when even the root layout fails. Plain inline styles: global CSS isn't loaded here. */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => reportClientError("boundary", error, error.digest), [error]);
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1a1325",
          color: "#f6f2fb",
          fontFamily: "system-ui, sans-serif",
          padding: 20,
          textAlign: "center",
        }}
      >
        <title>Something went wrong — Us vs. Us</title>
        <main role="alert" style={{ maxWidth: 360 }}>
          <h1 style={{ fontSize: 28 }}>Something went wrong</h1>
          <p style={{ color: "#bbb1cc", fontSize: 18 }}>Your game is safe — the server keeps it.</p>
          <button
            onClick={() => retry()}
            style={{
              marginTop: 16,
              width: "100%",
              minHeight: 56,
              borderRadius: 16,
              border: 0,
              background: "#f5a8e6",
              color: "#1a1325",
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
