"use client";
import { useState } from "react";
import { detectFormat, fileType } from "@/lib/detect-format";

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
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
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

      onUploaded(publicUrl, { type, ext, format });
    } catch (err) {
      console.error(err);
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
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
        {uploading
          ? `Uploading… ${progress}%`
          : value
          ? "Replace"
          : "Upload"}
        <input
          type="file"
          className="hidden"
          disabled={uploading}
          onChange={onFile}
        />
      </label>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
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
