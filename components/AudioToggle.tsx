"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Plays Perm's original 48-second ambient loop. Audio starts only after a user
 * gesture so the control follows browser autoplay and accessibility rules.
 */
export default function AudioToggle() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const fadeFrame = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const a = new Audio("/audio/perm-circular-current.wav");
    a.loop = true;
    a.preload = "none";
    a.volume = 0;
    audio.current = a;
    return () => {
      if (fadeFrame.current) cancelAnimationFrame(fadeFrame.current);
      a.pause();
      a.src = "";
      audio.current = null;
    };
  }, []);

  const fade = (to: number, done?: () => void) => {
    const a = audio.current;
    if (!a) return;
    if (fadeFrame.current) cancelAnimationFrame(fadeFrame.current);
    const from = a.volume;
    const started = performance.now();
    const duration = 650;
    const tick = (now: number) => {
      const p = Math.min(1, (now - started) / duration);
      const eased = p * p * (3 - 2 * p);
      a.volume = Math.max(0, Math.min(1, from + (to - from) * eased));
      if (p < 1) fadeFrame.current = requestAnimationFrame(tick);
      else done?.();
    };
    fadeFrame.current = requestAnimationFrame(tick);
  };

  const toggle = async () => {
    const a = audio.current;
    if (!a) return;
    try {
      if (a.paused) {
        await a.play();
        fade(0.42);
        setPlaying(true);
        setBlocked(false);
      } else {
        fade(0, () => a.pause());
        setPlaying(false);
      }
    } catch {
      setBlocked(true);
      setPlaying(false);
    }
  };

  return (
    <button
      className={`icon-button audio-toggle${playing ? " is-playing" : ""}`}
      type="button"
      onClick={toggle}
      aria-pressed={playing}
      aria-label={playing ? "Pause Perm background music" : "Play Perm background music"}
      title={blocked ? "Audio was blocked by your browser" : "Perm original ambient loop · Circular Current"}
    >
      <span className="audio-bars" aria-hidden="true">
        <i /><i /><i />
      </span>
      <span className="desktop-only">{playing ? "Music on" : "Music off"}</span>
    </button>
  );
}
