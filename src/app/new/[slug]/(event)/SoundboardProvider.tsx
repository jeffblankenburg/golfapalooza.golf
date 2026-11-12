"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { v2RealtimeClient } from "@/lib/v2/supabase-browser";
import { playSound, preloadSounds, unlockAudio } from "@/lib/v2/soundboard-audio";
import {
  soundboardChannel,
  BLAST_EVENT,
  type Sound,
  type SoundboardData,
  type BlastPayload,
} from "@/lib/v2/soundboard-types";
import SoundboardDrawer from "./SoundboardDrawer";
import styles from "./soundboard.module.css";

interface SoundboardCtx {
  enabled: boolean;
  isOperator: boolean;
  orgId: string;
  slug: string;
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  data: SoundboardData | null;
  setData: React.Dispatch<React.SetStateAction<SoundboardData | null>>;
  loading: boolean;
  reload: () => Promise<void>;
  blastOn: boolean;
  setBlastOn: (v: boolean) => void;
  /** Play a clip locally, log the play, and blast it if "Blast to group" is on. */
  playLocal: (sound: Sound) => void;
}

const Ctx = createContext<SoundboardCtx | null>(null);

export function useSoundboard() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSoundboard must be used within SoundboardProvider");
  return v;
}
/** Safe variant — returns null outside the provider (used by the shell top bar). */
export function useSoundboardOptional() {
  return useContext(Ctx);
}

export default function SoundboardProvider({
  orgId,
  slug,
  myName,
  enabled,
  isOperator,
  receiveBlasts,
  children,
}: {
  orgId: string;
  slug: string;
  myName: string;
  enabled: boolean;
  isOperator: boolean;
  receiveBlasts: boolean;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<SoundboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [blastOn, setBlastOn] = useState(false);
  const [toast, setToast] = useState<{ from: string; name: string } | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unlock audio on the first gesture anywhere in the app, so even members who
  // never tap the board can hear a blast (mobile autoplay policy).
  useEffect(() => {
    if (!enabled) return;
    const onGesture = () => unlockAudio();
    window.addEventListener("pointerdown", onGesture, { once: true });
    window.addEventListener("touchend", onGesture, { once: true });
    window.addEventListener("keydown", onGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("touchend", onGesture);
      window.removeEventListener("keydown", onGesture);
    };
  }, [enabled]);

  // Subscribe to the group's blast channel. Operators keep the channel to send;
  // every member plays incoming blasts unless they've opted out.
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let channel: RealtimeChannel | null = null;
    let client: Awaited<ReturnType<typeof v2RealtimeClient>> | null = null;

    (async () => {
      client = await v2RealtimeClient();
      if (!active) return;
      channel = client.channel(soundboardChannel(orgId), {
        config: { broadcast: { self: false } },
      });
      channel.on("broadcast", { event: BLAST_EVENT }, ({ payload }) => {
        const p = payload as BlastPayload;
        if (!receiveBlasts) return;
        void playSound(p.audioUrl);
        setToast({ from: p.fromName, name: p.name });
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 2600);
      });
      channel.subscribe();
      channelRef.current = channel;
    })();

    return () => {
      active = false;
      if (client && channel) client.removeChannel(channel);
      channelRef.current = null;
    };
  }, [enabled, orgId, receiveBlasts]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v2/soundboard?orgId=${orgId}`);
      if (res.ok) {
        const d = (await res.json()) as SoundboardData;
        setData(d);
        preloadSounds(d.sounds.map((s) => s.audio_url));
      }
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  const open = useCallback(() => {
    setIsOpen(true);
    // Let other universal drawers know to collapse (matches Music/Chat).
    window.dispatchEvent(new CustomEvent("ui:drawer-open", { detail: { name: "soundboard" } }));
    if (!data) void reload();
  }, [data, reload]);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => (isOpen ? close() : open()), [isOpen, open, close]);

  // Collapse when another universal drawer opens.
  useEffect(() => {
    const handler = (e: Event) => {
      const name = (e as CustomEvent<{ name?: string }>).detail?.name;
      if (name && name !== "soundboard") setIsOpen(false);
    };
    window.addEventListener("ui:drawer-open", handler);
    return () => window.removeEventListener("ui:drawer-open", handler);
  }, []);

  const playLocal = useCallback(
    (sound: Sound) => {
      void playSound(sound.audio_url);
      // Optimistic count bump.
      setData((d) =>
        d
          ? { ...d, sounds: d.sounds.map((s) => (s.id === sound.id ? { ...s, play_count: s.play_count + 1 } : s)) }
          : d,
      );
      // Log the play (fire-and-forget; never blocks the sound).
      fetch(`/api/v2/soundboard/${sound.id}/play`, { method: "POST" }).catch(() => {});
      // Blast to the group if enabled.
      if (blastOn && channelRef.current) {
        const payload: BlastPayload = {
          soundId: sound.id,
          audioUrl: sound.audio_url,
          name: sound.name,
          fromUserId: "",
          fromName: myName,
        };
        channelRef.current.send({ type: "broadcast", event: BLAST_EVENT, payload }).catch(() => {});
      }
    },
    [blastOn, myName],
  );

  const value: SoundboardCtx = {
    enabled,
    isOperator,
    orgId,
    slug,
    isOpen,
    open,
    close,
    toggle,
    data,
    setData,
    loading,
    reload,
    blastOn,
    setBlastOn,
    playLocal,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      {enabled && isOperator && <SoundboardDrawer />}
      {toast && (
        <div className={styles.blastToast} role="status">
          <span className={styles.blastToastWave} aria-hidden>
            🔊
          </span>
          <span>
            <strong>{toast.from}</strong> blasted {toast.name}
          </span>
        </div>
      )}
    </Ctx.Provider>
  );
}
