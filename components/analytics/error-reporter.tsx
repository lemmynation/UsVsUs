"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-errors";

/** Reports uncaught errors and rejected promises from the phone (built-in error monitoring). */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportClientError("error", e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => reportClientError("unhandledrejection", e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
