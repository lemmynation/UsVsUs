"use client";

import { useEffect } from "react";
import type { ClientEventName } from "@/lib/analytics/events";
import { trackClient } from "@/lib/client-api";

export function TrackOnMount({ event }: { event: ClientEventName }) {
  useEffect(() => trackClient(event), [event]);
  return null;
}
