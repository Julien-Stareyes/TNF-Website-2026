// Browser-side aspect-ratio detection. Given a File, loads it into an
// off-DOM element to read its intrinsic dimensions, then classifies the
// ratio into the same buckets the ffprobe migration used.
export async function detectFormat(file) {
  const url = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("video/")) {
      const dims = await new Promise((resolve, reject) => {
        const v = document.createElement("video");
        v.muted = true;
        v.preload = "metadata";
        v.onloadedmetadata = () =>
          resolve({ w: v.videoWidth, h: v.videoHeight });
        v.onerror = () => reject(new Error("video metadata failed"));
        v.src = url;
      });
      return classify(dims.w, dims.h);
    }
    // Image or GIF.
    const dims = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => reject(new Error("image load failed"));
      img.src = url;
    });
    return classify(dims.w, dims.h);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function classify(w, h) {
  if (!w || !h) return "16:9";
  const r = w / h;
  const cands = [
    ["16:9", 16 / 9],
    ["4:5", 4 / 5],
    ["9:16", 9 / 16],
    ["1:1", 1],
    ["4:3", 4 / 3],
    ["3:2", 3 / 2],
  ];
  cands.sort((a, b) => Math.abs(a[1] - r) - Math.abs(b[1] - r));
  return cands[0][0];
}

export function fileType(file) {
  if (file.type.startsWith("video/")) return "video";
  if (file.type === "image/gif") return "gif";
  return "image";
}
