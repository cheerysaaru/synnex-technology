/* App-wide state: connection mode, settings and toasts. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Settings } from "../types";
import { backend, connect, defaults, type Mode } from "./api";

interface Toast {
  id: number;
  message: string;
  tone: "ok" | "error";
}

interface AppState {
  ready: boolean;
  mode: Mode;
  needsPin: boolean;
  settings: Settings;
  counters: Record<string, number>;
  setSettings: (s: Settings, counters?: Record<string, number>) => void;
  toast: (message: string, tone?: "ok" | "error") => void;
  reconnect: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>("local");
  const [needsPin, setNeedsPin] = useState(false);
  const [settings, setSettingsState] = useState<Settings>(defaults as Settings);
  const [counters, setCounters] = useState<Record<string, number>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const reconnect = useCallback(async () => {
    const res = await connect();
    setMode(res.backend.mode);
    setNeedsPin(res.needsPin);
    if (!res.needsPin) {
      try {
        const s = await backend().settings();
        setSettingsState(s.settings);
        setCounters(s.counters);
      } catch {
        /* keep defaults */
      }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    reconnect();
    const onAuth = () => setNeedsPin(true);
    window.addEventListener("synnex:auth", onAuth);
    return () => window.removeEventListener("synnex:auth", onAuth);
  }, [reconnect]);

  const setSettings = useCallback((s: Settings, c?: Record<string, number>) => {
    setSettingsState(s);
    if (c) setCounters(c);
  }, []);

  return (
    <Ctx.Provider value={{ ready, mode, needsPin, settings, counters, setSettings, toast, reconnect }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`pointer-events-auto rounded-full px-5 py-2.5 text-sm font-semibold shadow-lg ${t.tone === "error" ? "bg-red-600 text-white" : "bg-navy text-white"}`}>
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useApp() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp must be used inside AppProvider");
  return c;
}
