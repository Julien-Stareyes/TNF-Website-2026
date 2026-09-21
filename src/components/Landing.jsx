"use client";
import { useEffect, useRef, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import { EditModeProvider, useEditMode } from "@/lib/edit-mode";
import { markMuted } from "@/lib/muted-video";

// Root landing page — plays the studio showreel edge-to-edge. Live theme
// sampling mirrors the other views so the overlay chrome stays readable
// over whatever the reel is showing right now.
const Landing = ({ videoUrl }) => (
  <EditModeProvider>
    <LandingView videoUrl={videoUrl} />
  </EditModeProvider>
);

const LandingView = ({ videoUrl: initialVideoUrl }) => {
  const videoRef = useRef(null);
  const [liveTheme, setLiveTheme] = useState(null);
  const [videoUrl, setVideoUrl] = useState(initialVideoUrl);
  const { enabled, request } = useEditMode();

  // Accept unsaved edits pushed from the admin's split-screen preview.
  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === "tnf-preview:landing" && e.data.payload)
        setVideoUrl(e.data.payload.showreelUrl || initialVideoUrl);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [initialVideoUrl]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 18;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const sample = () => {
      if (v.readyState < 2) return;
      try {
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let sum = 0;
        const pixels = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        }
        setLiveTheme(sum / pixels >= 128 ? "light" : "dark");
      } catch { /* not ready */ }
    };
    const id = setInterval(sample, 250);
    return () => clearInterval(id);
  }, []);

  const theme = liveTheme ?? "dark";

  return (
    <section
      className="fixed inset-0 overflow-hidden bg-black"
      data-tnf-action={enabled ? "showreel" : undefined}
      onClick={enabled ? () => request("pick-media", "showreelUrl") : undefined}
      title={enabled ? "Click to change the showreel" : undefined}
    >
      <SiteHeader active={null} theme={theme} />
      <video
        ref={(el) => { markMuted(el); videoRef.current = el; }}
        src={videoUrl}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 size-full object-cover pointer-events-none"
      />
    </section>
  );
};

export default Landing;
