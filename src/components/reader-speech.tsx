"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toSpeechChunks } from "@/lib/reader";
import type { ReaderHandle } from "@/components/reader-types";

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/**
 * Read-aloud, over the Web Speech API's speechSynthesis.
 *
 * Format-agnostic by construction: it only ever asks the ReaderHandle for
 * the text at a location and to advance, so the same control drives a PDF
 * page and an EPUB section.
 *
 * Text is spoken one chunk at a time rather than as a single utterance (see
 * toSpeechChunks). That's what makes it stoppable mid-page, and it avoids
 * the long-utterance truncation several engines have.
 *
 * Known limitation, stated plainly because it will be the first thing
 * anyone notices: browsers suspend speechSynthesis when the page is
 * backgrounded or the screen locks, so this stops when the app is
 * minimised. That's a browser policy, not something this component can
 * override.
 */
export function ReaderSpeech({ handleRef }: { handleRef: React.RefObject<ReaderHandle | null> }) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState<string>("");
  const [rate, setRate] = useState(1);

  // Held in refs, not state: the chunk queue is stepped from inside an
  // utterance's onend callback, which closes over whatever the values were
  // when speech started rather than seeing later renders.
  const queueRef = useRef<string[]>([]);
  const indexRef = useRef(0);
  const stoppedRef = useRef(true);
  const rateRef = useRef(rate);
  const voiceNameRef = useRef(voiceName);
  const speakNextRef = useRef<() => void>(() => {});

  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);
  useEffect(() => {
    voiceNameRef.current = voiceName;
  }, [voiceName]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    // Whether the browser can speak at all is a client-only fact, so it can
    // only be settled after mount — same pattern as the device-settings reads
    // elsewhere. Rendering nothing until then keeps a read-aloud button from
    // appearing and disappearing on a browser that has no speech support.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(true);

    // Voices load asynchronously in most browsers: the first call routinely
    // returns an empty list, with voiceschanged firing once they're ready.
    function loadVoices() {
      setVoices(window.speechSynthesis.getVoices());
    }
    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      // Speech outlives the page otherwise — navigating away mid-sentence
      // leaves the browser reading a book nobody is looking at any more.
      window.speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    queueRef.current = [];
    indexRef.current = 0;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  /** Loads the current location's text into the queue; false when there's nothing to read. */
  const fillFromCurrent = useCallback(async () => {
    const handle = handleRef.current;
    if (!handle) return false;
    const text = await handle.textAt(handle.currentLocation());
    queueRef.current = toSpeechChunks(text);
    indexRef.current = 0;
    return queueRef.current.length > 0;
  }, [handleRef]);

  const speakNext = useCallback(() => {
    if (stoppedRef.current) return;

    const chunk = queueRef.current[indexRef.current];
    if (chunk === undefined) {
      // End of this page/section: move on and keep reading. If advancing
      // yields no further text, the book is finished.
      const moved = handleRef.current?.advance() ?? false;
      if (!moved) {
        stop();
        return;
      }
      // Let the reader settle on the new location before asking for its text;
      // both engines render asynchronously.
      setTimeout(() => {
        void (async () => {
          if (stoppedRef.current) return;
          if (await fillFromCurrent()) speakNextRef.current();
          else stop();
        })();
      }, 400);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.rate = rateRef.current;
    const voice = window.speechSynthesis.getVoices().find((v) => v.name === voiceNameRef.current);
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
      indexRef.current += 1;
      speakNextRef.current();
    };
    utterance.onerror = () => stop();
    window.speechSynthesis.speak(utterance);
  }, [handleRef, stop, fillFromCurrent]);

  // Kept in a ref so the onend callback above always reaches the current
  // implementation rather than the one captured when speech began.
  useEffect(() => {
    speakNextRef.current = speakNext;
  }, [speakNext]);

  async function start() {
    stoppedRef.current = false;
    window.speechSynthesis.cancel();
    if (!(await fillFromCurrent())) {
      // A scanned PDF with no text layer is the usual reason.
      stoppedRef.current = true;
      return;
    }
    setSpeaking(true);
    speakNext();
  }

  if (!supported) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-sep px-4 py-2 text-sm">
      <button
        onClick={() => (speaking ? stop() : void start())}
        className="rounded-md border border-sep px-3 py-1 hover:bg-hover"
      >
        {speaking ? "■ Stop" : "🔊 Read aloud"}
      </button>

      <label className="text-sec">
        <span className="sr-only">Reading speed</span>
        <select
          value={rate}
          onChange={(e) => setRate(Number(e.target.value))}
          className="rounded border border-sep px-1 py-1"
        >
          {RATES.map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>
      </label>

      {voices.length > 0 && (
        <label className="min-w-0 text-sec">
          <span className="sr-only">Voice</span>
          <select
            value={voiceName}
            onChange={(e) => setVoiceName(e.target.value)}
            className="max-w-48 truncate rounded border border-sep px-1 py-1"
          >
            <option value="">Default voice</option>
            {voices.map((voice) => (
              <option key={voice.name} value={voice.name}>
                {voice.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {speaking && <span className="text-xs text-ter">Stops if you minimise the app.</span>}
    </div>
  );
}
