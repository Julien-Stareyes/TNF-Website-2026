"use client";
import { useState } from "react";
import { detectFormat, fileType } from "@/lib/detect-format";

// Grabs the first frame of a just-picked video file and returns it as a
// JPEG Blob -- used to auto-derive a poster image when the cover video
// itself is uploaded, so the two can never drift out of sync the way a
// separately, manually uploaded poster can. Reading it from a local
// `File` via `URL.createObjectURL` rather than the eventual R2 URL is
// what makes this reliable: no CORS concerns (a blob: URL is same-origin,
// so the canvas is never tainted, even for `toBlob`), no network/CORS
// wait, and no dependence on the R2 bucket's own rate limiting.
async function extractFirstFramePoster(file) {
  const objectUrl = URL.createObjectURL(file);
  // A <video> that's never attached to the document is unreliable for
  // decoding in several browsers (Safari especially, but some Chrome
  // versions too) -- it can sit forever without ever firing loadeddata.
  // Attaching it off-screen (not display:none, which also blocks
  // decode -- see ProjectMedia's own cover-reveal fix) makes decode
  // reliable, and it costs nothing here since the source is a local
  // blob: URL, not a network request.
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.style.position = "fixed";
  video.style.left = "0";
  video.style.top = "0";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  document.body.appendChild(video);

  try {
    video.src = objectUrl;

    await Promise.race([
      new Promise((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error("video decode failed"));
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("poster extraction timed out")), 8000)
      ),
    ]);

    // Some browsers only start actually decoding frames once playback
    // has been requested, even for a muted, off-screen element -- a
    // quick play/pause nudges that along before we grab the frame.
    try {
      await video.play();
      video.pause();
    } catch {
      // Autoplay can be blocked in rare configs -- loadeddata already
      // fired above, so we still have a frame to draw either way.
    }

    // `loadeddata` lands at currentTime 0 for a local blob almost every
    // time, but a stray frame or two can still have gone by -- same
    // snap-back used for the on-page cover reveal, so the two always
    // agree on what "first frame" means.
    if (video.currentTime > 0.05) {
      video.currentTime = 0;
      await new Promise((resolve) => {
        video.onseeked = () => resolve();
      });
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1;
    canvas.height = video.videoHeight || 1;
    canvas.getContext("2d").drawImage(video, 0, 0);

    return await new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.9)
    );
  } finally {
    video.remove();
    URL.revokeObjectURL(objectUrl);
  }
}

// One upload slot. By default it requests a presigned R2 URL from the
// server and PUTs the file directly to R2 — the app server never handles
// the bytes, which matters for the large video files uploaded elsewhere
// in the admin. Pass `viaProxy` for a small, same-origin-only upload
// (e.g. the Info page's client logos): the file goes to our own
// /api/upload-proxy instead, which uploads to R2 server-side. That's
// what a presigned PUT can't do here — the R2 bucket has no CORS policy
// configured (inherited project, no dashboard access to add one), so the
// browser's direct cross-origin PUT fails its preflight every time.
export default function UploadField({
  label,
  slug,
  role,
  tab,
  value,
  onUploaded,
  viaProxy = false,
  // When true and the picked file is a video, also derives a poster JPEG
  // from its first frame, uploads that alongside it (role: "poster"), and
  // includes its URL in the `meta` object `onUploaded` receives as
  // `meta.posterUrl`. Only the cover-desktop field wires this up.
  extractPoster = false,
}) {
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [posterWarning, setPosterWarning] = useState("");
  const [progress, setProgress] = useState(0);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setPosterWarning("");
    setUploading(true);
    setProgress(0);
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      const contentType = file.type || "application/octet-stream";

      // Detect aspect ratio before upload so the caller can persist it
      // alongside the URL — the browser has cheap access to intrinsic
      // dimensions and doing this server-side would need another download.
      const type = fileType(file);
      const format = await detectFormat(file).catch(() => "16:9");

      let publicUrl;
      if (viaProxy) {
        const body = new FormData();
        body.append("file", file);
        body.append("slug", slug);
        body.append("role", role);
        if (tab) body.append("tab", tab);
        body.append("ext", ext);
        body.append("contentType", contentType);
        const res = await fetch("/api/upload-proxy", { method: "POST", body });
        if (!res.ok) throw new Error("Upload failed");
        setProgress(100);
        ({ publicUrl } = await res.json());
      } else {
        const presignRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, role, tab, ext, contentType }),
        });
        if (!presignRes.ok) throw new Error("Failed to sign upload");
        const signed = await presignRes.json();
        publicUrl = signed.publicUrl;
        await putWithProgress(signed.url, file, (p) => setProgress(p));
      }

      let posterUrl;
      if (extractPoster && type === "video") {
        setExtracting(true);
        try {
          const posterBlob = await extractFirstFramePoster(file);
          if (posterBlob) {
            const posterPresignRes = await fetch("/api/upload", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                slug,
                role: "poster",
                tab,
                ext: "jpg",
                contentType: "image/jpeg",
              }),
            });
            if (posterPresignRes.ok) {
              const posterSigned = await posterPresignRes.json();
              await putWithProgress(posterSigned.url, posterBlob, () => {});
              posterUrl = posterSigned.publicUrl;
            }
          }
        } catch (posterErr) {
          // The cover upload itself already succeeded -- a failed poster
          // extraction (an unusual codec the browser can't decode client
          // side, say) shouldn't fail the whole upload over it. Surface it
          // in the UI too, not just the console -- a silent failure here
          // is exactly what left a stale poster in place undetected before.
          console.error("Poster extraction failed", posterErr);
          setPosterWarning(
            "Extraction auto de la première frame échouée -- uploade l'image manuellement dans Cover image (poster)."
          );
        }
      }

      onUploaded(publicUrl, { type, ext, format, posterUrl });
    } catch (err) {
      console.error(err);
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
      setExtracting(false);
      setProgress(0);
      e.target.value = "";
    }
  };

  return (
    <div>
      {label && (
        <span className="block text-xs uppercase tracking-widest text-white/60 mb-1">
          {label}
        </span>
      )}
      {value ? (
        <div className="text-xs text-white/60 truncate mb-1">
          {value.split("/").slice(-2).join("/")}
        </div>
      ) : null}
      <label className="inline-block border border-white/20 px-3 py-1.5 rounded cursor-pointer hover:bg-white/10 text-sm">
        {extracting
          ? "Extracting poster…"
          : uploading
          ? `Uploading… ${progress}%`
          : value
          ? "Replace"
          : "Upload"}
        <input
          type="file"
          className="hidden"
          disabled={uploading || extracting}
          onChange={onFile}
        />
      </label>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
      {posterWarning && (
        <p className="text-amber-400 text-xs mt-1">{posterWarning}</p>
      )}
    </div>
  );
}

// XHR gives us upload progress; fetch() doesn't expose it in browsers yet.
function putWithProgress(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`PUT ${xhr.status}`));
    xhr.onerror = () => reject(new Error("network error"));
    xhr.send(file);
  });
}
