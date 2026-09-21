"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import SiteHeader from "@/components/SiteHeader";
import { EditModeProvider } from "@/lib/edit-mode";
import { markMuted } from "@/lib/muted-video";

// Immersive tab -- a real 3D carousel: every project sits as a plane on
// its own point around a circle, the whole ring turns to bring one to
// front, and each plane runs a small GLSL shader (a cylindrical bend +
// a focus-driven colour/desaturation blend + a glowing rim) rather than
// CSS transforms faking the depth. Built from the reference screenshot
// (stylized.cortiz.dev's marketing shot) plus the confirmed stack behind
// it (Three.js, GSAP) -- there's no real source for that exact carousel,
// so this is a fresh build in vanilla Three.js, matching how the rest of
// this project already uses it (Logo3D.jsx has no react-three-fiber
// either). The dark stage, floor rings, corner ticks, arrows, thumbnail
// strip and caption are the same HTML/CSS chrome as before, now layered
// over the canvas instead of over a CSS-transformed card stack.

// Rotation now matches the user's reference build (a plain HTML/CSS
// carousel: each panel sits at `rotateY(angle) translateZ(radius)` inside
// a single spinning parent) rather than the earlier damped-facing pass.
// Translated to Three.js: every card is a child of `ring`, so its own
// `rotation.y` only has to be its fixed position angle -- the ring's own
// `rotation.y` (the thing that actually spins) is inherited on top of
// that for free, exactly like the reference's parent `rotateY`. No
// per-frame facing correction, no damping: a card is fully outward-facing
// at its position on the circle, and reads dead-on the moment its angle
// lines up with the front, the same way the reference's counter-rotating
// preview element does -- except here the geometry itself does the work,
// so there's no separate preview node to keep in sync.
const RING_RADIUS = 7.9;
const CARD_W = 9.2;
// Independently tunable from CARD_W now (see the "Largeur"/"Hauteur"
// dev-panel sliders and the liveScaleX/liveScaleY split in tick()) --
// no longer derived from CARD_W's own aspect ratio.
const CARD_H = 4.3;
const CAMERA_Z = 12.5;
const CAMERA_FOV = 57;
// How much of the ring's circumference a card holds its own focus over
// (in units of the per-card angle step) before another card takes it.
const FOCUS_WIDTH = 0.85;
const DRAG_SENSITIVITY = 0.006;
// Eased toward the target every frame (both from wheel input and from an
// explicit goTo), same lerp-based smoothing as the reference.
const SPRING = 0.07;
// Radians of ring rotation per unit of wheel delta -- continuous and
// unlocked, same as the reference's `targetRotation -= e.deltaY * 0.2`
// (0.2deg per unit, in radians here).
const WHEEL_SENSITIVITY = 0.0035;
// How long after the last wheel tick (ms) before the ring snaps to
// whichever project it's currently nearest -- free/continuous while
// actively scrolling, but always settles centred once you stop, rather
// than being able to come to rest at an arbitrary angle between two
// cards.
const WHEEL_SNAP_DELAY = 160;
// Corner radius for the rounded-rect mask in the shader, in the same
// aspect-corrected unit as the SDF below (card half-height = 1).
const CORNER_RADIUS = 0.04;
// Thin white stroke around every card's rounded-rect edge -- see
// uBorderWidth in the fragment shader.
const CARD_BORDER_WIDTH = 0.010;
// Cylindrical bulge amount (vertex shader uCurve), tuned via the debug panel.
const CARD_CURVE = 1.75;
// Ring tilt (rotation.x, radians) -- 0 keeps the ring perfectly horizontal
// (every card at y=0, flat on the X/Z plane); a small negative value tips
// the whole ring back slightly so it reads as leaning rather than dead
// level, like the reference's carousel. Purely a static pitch on the ring
// group itself, unrelated to ring.rotation.y (the existing spin).
const RING_TILT = 0.25;
// Second tilt axis (rotation.z, roll) -- see RING_TILT above and the
// "Inclinaison (X)" dev-panel slider.
const RING_TILT_X = 0.07;
// Static ring position offset, dialed in alongside the tilt above so the
// ring stays framed after tilting (see the "Position X/Y" dev-panel
// sliders and the tiltGroup/ring split in the effect below).
const RING_POS_X = 0;
const RING_POS_Y = 2.0;
// Subtle mouse-parallax tilt -- moving the pointer nudges the whole ring
// a few degrees, like slowly orbiting a GLB viewer, layered on top of the
// static tilt above rather than replacing it. Smoothed (PARALLAX_EASE)
// so it drifts toward the pointer instead of snapping to it, and capped
// small (PARALLAX_AMOUNT_*) so it reads as a gentle live-in feel, not a
// jarring turn. Desktop only -- see the isMobile guard on the listener.
const PARALLAX_AMOUNT_X = 0.11; // yaw (tiltGroup.rotation.y), radians
const PARALLAX_AMOUNT_Y = 0.075; // pitch (tiltGroup.rotation.x), radians
const PARALLAX_EASE = 0.06;

const VERTEX_SHADER = /* glsl */ `
  uniform float uCurve;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 pos = position;
    // Bulges toward the viewer at the card's own edges and stays flat
    // at its centre -- a cheap stand-in for a true cylindrical bend, since
    // a flat card facing outward from the ring already reads as "curved"
    // once a few of them are in view at once. (Flipped from a centre-peak
    // sine to an edge-peak cosine so the curvature reads on the sides of
    // the card instead of bulging in the middle.)
    float bend = 1.0 - cos((uv.x - 0.5) * 3.14159265);
    pos.z -= bend * uCurve;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision mediump float;
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform float uFocus; // 0..1 -- how close this card is to the front
  uniform float uAspect; // card width / height
  uniform float uRadius; // corner radius, in the aspect-corrected unit below
  uniform float uBorderWidth; // white stroke thickness, same unit as uRadius
  // Texture's own width/height, in card-uAspect terms -- lets the lookup
  // below crop like CSS object-fit:cover instead of stretching a
  // video/image to fit the card's own aspect ratio. Defaults to uAspect
  // (no crop) until the real value lands once the video/image loads --
  // see the video "loadedmetadata" / image-load callbacks below.
  uniform float uTexAspect;
  varying vec2 vUv;

  // CSS object-fit:cover, done in UV space: crop the wider axis so
  // the texture fills the card with no stretch, keeping it centred.
  vec2 coverUv(vec2 uv, float texAspect, float cardAspect) {
    vec2 st = uv - 0.5;
    if (texAspect > cardAspect) {
      st.x *= cardAspect / texAspect;
    } else {
      st.y *= texAspect / cardAspect;
    }
    return st + 0.5;
  }

  // Signed distance to a rounded rect, half-size b, corner radius r.
  float roundedBoxSDF(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }

  void main() {
    // -1..1 across the short axis, aspect-corrected on the long one, so
    // the corner radius reads as the same physical size on every edge
    // instead of stretching with the card's own aspect ratio. Uses the
    // undistorted vUv on purpose -- only the texture lookup below gets
    // warped, so the card's own shape/mask stays crisp.
    vec2 p = (vUv - 0.5) * 2.0;
    p.x *= uAspect;
    float d = roundedBoxSDF(p, vec2(uAspect, 1.0) - uRadius, uRadius);
    if (d > 0.0) discard;

    vec2 mapUv = coverUv(vUv, uTexAspect, uAspect);

    // Every card shows its own true colour regardless of focus now -- no
    // more dim/desaturated "fog" haze on the off-focus ones.
    vec3 color;
    if (uHasMap > 0.5) {
      color = texture2D(uMap, clamp(mapUv, 0.0, 1.0)).rgb;
    } else {
      color = vec3(0.045, 0.1, 0.12);
    }

    // Slight vignette to soften the card's own corners.
    float vig = smoothstep(0.95, 0.4, length(vUv - 0.5));
    color *= mix(0.72, 1.0, vig);

    // Thin white stroke, inset from the card's own rounded-rect edge
    // (same SDF as the mask above, so it follows the corners exactly
    // instead of being a separate rectangle). A flat, fully-white band
    // from the edge (insideDist=0) to uBorderWidth inward, antialiased
    // only over a tiny fixed AA width at each boundary -- not a fade
    // across the whole stroke, which is what read as a glow rather than
    // a crisp line.
    float insideDist = -d;
    float strokeAA = 0.0035;
    float border =
      smoothstep(-strokeAA, strokeAA, insideDist) *
      (1.0 - smoothstep(uBorderWidth - strokeAA, uBorderWidth + strokeAA, insideDist));
    color = mix(color, vec3(1.0), border);

    // Dim cards that aren't the active/centred one -- uFocus is 1.0
    // at dead-centre and eases down to 0 toward the edge of the focus
    // window, so this reads as the active card at full opacity and
    // every other card settled at 0.8 well before it's off-centre.
    float opacity = mix(0.8, 1.0, uFocus);
    gl_FragColor = vec4(color, opacity);
  }
`;

// A different, slowly-moving background gradient per project -- two
// colours derived from a cheap string hash of the slug, so it's stable
// across renders/refreshes without storing anything, and every project
// reliably gets its own hue rather than a random one on each mount.
// tnf-imm3d-bg (globals.css) does the actual animating: this just picks
// the two endpoint colours it animates between.
function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}
// Hand-picked per-project instead of the hashed default below, at
// Julien's request -- each pair is the two endpoint colours
// tnf-imm3d-bg (globals.css) slowly animates between.
const BG_GRADIENT_OVERRIDES = {
  "mcm-harper-collective-x-mcm": { a: "#08090a", b: "#15304a" }, // noir / bleu ciel sombre
  "jpg-crocs": { a: "#f2f2f0", b: "#8a8a8d" }, // blanc / gris
  "pucci-croix-rouge": { a: "#603114", b: "#642520" }, // orange encore plus assombri / rouge encore plus assombri
  "franck-muller-vanguard": { a: "#08090b", b: "#101d3d" }, // noir / bleu foncé
};
function gradientColorsForProject(slug) {
  if (slug && BG_GRADIENT_OVERRIDES[slug]) return BG_GRADIENT_OVERRIDES[slug];
  const hue = hashHue(slug || "");
  return {
    a: `hsl(${hue}, 45%, 20%)`,
    b: `hsl(${(hue + 55) % 360}, 55%, 8%)`,
  };
}

// Breakpoint-aware mobile flag -- same pattern as ScrollScramble.jsx's
// useIsMobile, used here to skip the mouse-parallax pointermove listener
// entirely on phones: it's keyed off a hover pointer touch devices don't
// have, and a finger drag on the ring itself already drives the carousel
// through its own listeners.
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
};

const mod = (n, m) => ((n % m) + m) % m;
// Shortest signed distance from a to b around a full circle (2*PI).
const angleDelta = (a, b) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

// `intro` is still accepted (the page passes settings.intro) but no
// longer rendered anywhere -- the intro copy/brand block was removed in
// favour of just the current project's name, bottom-left.
export default function ImmersiveCarousel3D({ projects }) {
  return (
    <EditModeProvider>
      <CarouselView projects={projects} />
    </EditModeProvider>
  );
}

function CarouselView({ projects }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const N = projects.length;
  const stepAngle = N > 0 ? (Math.PI * 2) / N : 0;

  const containerRef = useRef(null);
  const [centerIndex, setCenterIndex] = useState(0);
  const centerIndexRef = useRef(0);
  const routerRef = useRef(router);
  routerRef.current = router;
  // The Three.js effect below owns the real `goTo` (it closes over the
  // ring, the rotation refs, etc.) -- the plain-HTML arrow/thumbnail
  // buttons reach it through this ref rather than the DOM node itself.
  const goToRef = useRef(() => {});
  // Dev-only live tuning (size / gap / background) -- refs so the tick
  // loop (inside the effect below, only ever created once) picks up a
  // change on the very next frame without needing to rebuild the whole
  // WebGL scene; the matching state is only there so the debug panel's
  // sliders/inputs and their numeric readouts re-render.
  const cardSizeRef = useRef(CARD_W);
  // Independent from cardSizeRef (width) -- see the "Hauteur" slider and
  // the liveScaleX/liveScaleY split in tick() below, which is what makes
  // width and height actually adjustable separately instead of always
  // scaling together off CARD_W's own aspect ratio.
  const cardHeightRef = useRef(CARD_H);
  const ringRadiusRef = useRef(RING_RADIUS);
  // Curvature = the vertex shader's cylindrical bulge (uCurve); corner =
  // the fragment shader's rounded-rect mask (uRadius) -- "l'arrondi si il
  // y a" is this one, 0 meaning square corners.
  const curveRef = useRef(CARD_CURVE);
  const cornerRef = useRef(CORNER_RADIUS);
  // Same live-ref pattern as the others, applied straight to the ring
  // group's rotation.x every frame -- see RING_TILT above.
  const tiltRef = useRef(RING_TILT);
  const [cardSize, setCardSize] = useState(CARD_W);
  const [cardHeight, setCardHeight] = useState(CARD_H);
  const [ringRadius, setRingRadius] = useState(RING_RADIUS);
  const [curve, setCurve] = useState(CARD_CURVE);
  const [corner, setCorner] = useState(CORNER_RADIUS);
  const [tilt, setTilt] = useState(RING_TILT);
  // A second tilt axis, alongside "Inclinaison (Y)" above (which is
  // ring.rotation.x, pitching the ring forward/back) -- this one is
  // ring.rotation.z, rolling the ring sideways (leaning left/right)
  // rather than forward/back. Off by default (0).
  const tiltXRef = useRef(RING_TILT_X);
  const [tiltX, setTiltX] = useState(RING_TILT_X);
  // Camera field of view -- widening it (at a fixed camera distance)
  // brings more of the ring's width into frame, so the side cards stop
  // clipping against the edges of the browser window. Kept live/tunable
  // rather than guessed, same reason as everything else in this panel.
  const cameraFovRef = useRef(CAMERA_FOV);
  const [cameraFov, setCameraFov] = useState(CAMERA_FOV);
  // Ring position offset -- tilting the ring (rotation.x) pivots it around
  // the world origin, which visibly drops/raises it out of frame since the
  // camera itself never moves. These let that be compensated (or just
  // framed differently) by nudging the ring's own position afterward,
  // instead of only ever being able to tilt around a fixed point.
  const ringPosXRef = useRef(RING_POS_X);
  const ringPosYRef = useRef(RING_POS_Y);
  const [ringPosX, setRingPosX] = useState(RING_POS_X);
  const [ringPosY, setRingPosY] = useState(RING_POS_Y);
  // Pointer position, normalized -1..1 from the viewport edges -- updated
  // on every mousemove regardless of `dragging` (unlike onPointerMove
  // below, which only drives the drag-to-rotate gesture). The *Smooth*
  // refs are what tick() actually applies, eased toward the *Target
  // refs every frame, same PARALLAX_EASE pattern as SPRING elsewhere.
  const parallaxTargetXRef = useRef(0);
  const parallaxTargetYRef = useRef(0);
  const parallaxSmoothXRef = useRef(0);
  const parallaxSmoothYRef = useRef(0);
  const [bgOverride, setBgOverride] = useState(null);
  const onCardSizeChange = useCallback((e) => {
    const v = parseFloat(e.target.value);
    cardSizeRef.current = v;
    setCardSize(v);
  }, []);
  const onCardHeightChange = useCallback((e) => {
    const v = parseFloat(e.target.value);
    cardHeightRef.current = v;
    setCardHeight(v);
  }, []);
  const onRingRadiusChange = useCallback((e) => {
    const v = parseFloat(e.target.value);
    ringRadiusRef.current = v;
    setRingRadius(v);
  }, []);
  const onCurveChange = useCallback((e) => {
    const v = parseFloat(e.target.value);
    curveRef.current = v;
    setCurve(v);
  }, []);
  const onCornerChange = useCallback((e) => {
    const v = parseFloat(e.target.value);
    cornerRef.current = v;
    setCorner(v);
  }, []);
  const onTiltChange = useCallback((e) => {
    const v = parseFloat(e.target.value);
    tiltRef.current = v;
    setTilt(v);
  }, []);
  const onTiltXChange = useCallback((e) => {
    const v = parseFloat(e.target.value);
    tiltXRef.current = v;
    setTiltX(v);
  }, []);
  const onCameraFovChange = useCallback((e) => {
    const v = parseFloat(e.target.value);
    cameraFovRef.current = v;
    setCameraFov(v);
  }, []);
  const onRingPosXChange = useCallback((e) => {
    const v = parseFloat(e.target.value);
    ringPosXRef.current = v;
    setRingPosX(v);
  }, []);
  const onRingPosYChange = useCallback((e) => {
    const v = parseFloat(e.target.value);
    ringPosYRef.current = v;
    setRingPosY(v);
  }, []);
  const onBgChange = useCallback((e) => setBgOverride(e.target.value), []);
  const onBgReset = useCallback(() => setBgOverride(null), []);

  // The debug panel has nothing to do with the admin's content-edit mode
  // (that only ever turns on inside the back-office's preview iframe) --
  // it's a plain `?debug=1` on the URL, so it works on the live page in
  // an ordinary browser tab, which is where the carousel actually needs
  // to be eyeballed at full size.
  const [debugOn, setDebugOn] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).has("debug")) setDebugOn(true);
  }, []);
  // Collapsed/expanded state for the debug panel itself -- separate from
  // debugOn (which just gates whether it exists at all, via ?debug=1).
  // Lets it be tucked away without losing it entirely while eyeballing
  // the carousel full-screen.
  const [panelVisible, setPanelVisible] = useState(true);
  const onTogglePanel = useCallback(() => setPanelVisible((v) => !v), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || N === 0) return undefined;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 100);
    camera.position.set(0, 0, CAMERA_Z);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);

    // Tilt and spin are kept on two separate, nested groups rather than
    // all three rotation axes on one object. With everything on a single
    // group, ring.rotation.x/z (the tilt) and ring.rotation.y (the spin)
    // combine as one Euler rotation, and since Euler axes aren't
    // commutative, a fixed tilt value visually "swims" -- it reads as
    // rotating along with the spin instead of staying put, which is what
    // looked like the tilt not sticking. `tiltGroup` holds only the
    // (mostly static, dev-panel-driven) tilt/position; `ring`, its child,
    // holds only the continuously-changing spin (rotation.y) -- so the
    // tilt is a fixed viewing angle on the whole assembly, independent of
    // wherever the spin currently is.
    const tiltGroup = new THREE.Group();
    scene.add(tiltGroup);
    const ring = new THREE.Group();
    tiltGroup.add(ring);

    // One <video> per project with a cover clip, muted/looping like the
    // rest of the site's card media -- only the front-facing one or two
    // are actually playing at a time (see the focus loop below).
    const videos = projects.map((p) => {
      if (!p.video) return null;
      const el = document.createElement("video");
      el.src = `${p.video}#t=0.1`;
      el.loop = true;
      el.playsInline = true;
      el.preload = "auto";
      // No crossOrigin needed: the covers are served through our own
      // /api/media-proxy route (see immersive/page.js's toProxyUrl),
      // which makes them same-origin -- WebGL can sample a same-origin
      // video/image as a texture with no CORS negotiation at all. (A
      // crossOrigin request would need R2's own CORS policy configured,
      // which this project doesn't have dashboard access to.)
      markMuted(el);
      return el;
    });

    // Same reasoning as the video elements above -- WebGL needs the
    // Same reasoning as the video elements above -- same-origin via
    // /api/media-proxy, so no crossOrigin/CORS negotiation needed.
    const textureLoader = new THREE.TextureLoader();

    const geometry = new THREE.PlaneGeometry(CARD_W, CARD_H, 24, 1);

    const meshes = projects.map((p, i) => {
      const uniforms = {
        uMap: { value: null },
        uHasMap: { value: 0 },
        uFocus: { value: 0 },
        uCurve: { value: curveRef.current },
        uAspect: { value: CARD_W / CARD_H },
        uTexAspect: { value: CARD_W / CARD_H },
        uRadius: { value: cornerRef.current },
        uBorderWidth: { value: CARD_BORDER_WIDTH },
      };
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        // Cards on the far half of the ring face outward, away from the
        // ring's centre -- which also means away from the camera, so
        // their front face never points at us. With the default
        // THREE.FrontSide that back face is simply culled and those
        // cards render as nothing (no fog involved -- this is what read
        // as "cards far away disappearing"). DoubleSide renders both
        // faces so every card stays visible all the way around the spin.
        side: THREE.DoubleSide,
        transparent: true,
      });
      const mesh = new THREE.Mesh(geometry, material);
      const angle = i * stepAngle;
      // Facing follows the full circle, set once and never touched again
      // -- the ring's own rotation.y (applied every frame in tick()) is
      // inherited on top of this local angle, exactly like the
      // reference's `rotateY(angle) translateZ(radius)` panel sitting
      // inside a parent that spins with `rotateY(currentRotation)`.
      // Position (radius) and scale (size) ARE touched every frame, from
      // the dev-panel refs below, so this initial set is just a sane
      // first frame before tick() runs.
      mesh.position.set(
        Math.sin(angle) * ringRadiusRef.current,
        0,
        Math.cos(angle) * ringRadiusRef.current,
      );
      mesh.rotation.y = angle;
      mesh.userData.angle = angle;
      mesh.userData.index = i;
      ring.add(mesh);

      const video = videos[i];
      if (video) {
        const tex = new THREE.VideoTexture(video);
        tex.colorSpace = THREE.SRGBColorSpace;
        uniforms.uMap.value = tex;
        uniforms.uHasMap.value = 1;
        // Real aspect ratio isn't known until the browser has read the
        // video's metadata -- until then uTexAspect stays at its
        // card-matching default above (no crop, but no stretch either).
        video.addEventListener(
          "loadedmetadata",
          () => {
            if (video.videoWidth && video.videoHeight) {
              uniforms.uTexAspect.value = video.videoWidth / video.videoHeight;
            }
          },
          { once: true },
        );
      } else if (p.image) {
        textureLoader.load(p.image, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          uniforms.uMap.value = tex;
          uniforms.uHasMap.value = 1;
          const img = tex.image;
          if (img && img.width && img.height) {
            uniforms.uTexAspect.value = img.width / img.height;
          }
        });
      }
      return mesh;
    });

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
    };
    resize();
    window.addEventListener("resize", resize);

    // Rotation state. `rotRef` is what's actually applied to the ring
    // every frame; `targetRef` is where it's easing toward (or, while
    // dragging, exactly where it already is, so letting go never snaps
    // back before the release-snap kicks in).
    const rotRef = { current: 0 };
    const targetRef = { current: 0 };
    let dragging = false;
    let lastX = 0;

    const setTargetForIndex = (idx) => {
      // Walk to the *nearest* unwrapped angle for this index rather than
      // its canonical [0, 2*PI) one, so the ring always turns the short
      // way instead of spinning back round through the whole stack.
      const raw = -idx * stepAngle;
      const k = Math.round((rotRef.current - raw) / (Math.PI * 2));
      targetRef.current = raw + k * Math.PI * 2;
    };

    // goTo only ever sets *where the ring is easing toward* -- which
    // project is "active" (caption, focus glow, thumbnail highlight) is
    // derived fresh from the ring's actual rotation every frame in tick(),
    // same as the reference's `showActiveSlide()`. That keeps a single
    // source of truth: an explicit goTo, a drag, and free wheel-spin all
    // just move the same rotation value, and the display always reflects
    // wherever that value currently sits -- nothing here "locks" the ring.
    const goTo = (idx) => {
      setTargetForIndex(idx);
    };

    container.style.cursor = "grab";
    container.style.touchAction = "none";
    const onPointerDown = (e) => {
      dragging = true;
      lastX = e.clientX;
      container.style.cursor = "grabbing";
    };
    const onPointerMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      rotRef.current += dx * DRAG_SENSITIVITY;
      targetRef.current = rotRef.current;
    };
    const onPointerUp = () => {
      if (!dragging) return;
      dragging = false;
      container.style.cursor = "grab";
      // No snap-to-nearest on release -- the ring stays exactly wherever
      // it was dragged to, free-spinning like a wheel gesture would. The
      // "active" project for the caption/thumbnails is still whichever
      // index tick() currently rounds the rotation to, it just isn't
      // forced to sit dead-on that angle.
    };
    container.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    // Mouse parallax -- independent of onPointerMove above (which only
    // tracks the pointer while `dragging`), this always tracks where the
    // pointer is so tick() can ease the ring's tilt toward it. Skipped
    // entirely on mobile, where there's no hover pointer to parallax off.
    const onParallaxMove = (e) => {
      parallaxTargetXRef.current = (e.clientX / window.innerWidth) * 2 - 1;
      parallaxTargetYRef.current = (e.clientY / window.innerHeight) * 2 - 1;
    };
    if (!isMobile) window.addEventListener("pointermove", onParallaxMove);

    // Click (not drag) on a card: front card opens the project, a side
    // one steps the ring to bring it to front.
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let downAt = null;
    const onClickDown = (e) => {
      downAt = { x: e.clientX, y: e.clientY };
    };
    const onClickUp = (e) => {
      if (!downAt) return;
      const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
      downAt = null;
      if (moved > 6) return; // a drag, not a click
      const rect = container.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hit = raycaster.intersectObjects(meshes)[0];
      if (!hit) return;
      const idx = hit.object.userData.index;
      if (idx === centerIndexRef.current) {
        routerRef.current.push(`/${projects[idx].slug}`);
      } else {
        goTo(idx);
      }
    };
    container.addEventListener("pointerdown", onClickDown);
    window.addEventListener("pointerup", onClickUp);

    // Continuous, unlocked wheel-driven spin while it's actually moving
    // -- every wheel tick nudges the target rotation directly, matching
    // the reference's `targetRotation -= e.deltaY * 0.2`. What settles
    // it afterward is the debounced snap below: WHEEL_SNAP_DELAY ms
    // after the last tick, goTo() the nearest project so a fast flick
    // still always ends up centred rather than stopping wherever the
    // spring happened to be easing through.
    let wheelSnapTimer = null;
    const onWheel = (e) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 1) return;
      e.preventDefault();
      targetRef.current -= delta * WHEEL_SENSITIVITY;
      if (wheelSnapTimer) clearTimeout(wheelSnapTimer);
      wheelSnapTimer = setTimeout(() => {
        goTo(mod(Math.round(-targetRef.current / stepAngle), N));
      }, WHEEL_SNAP_DELAY);
    };
    container.addEventListener("wheel", onWheel, { passive: false });

    const onKey = (e) => {
      if (e.key === "ArrowRight") goTo(centerIndexRef.current + 1);
      else if (e.key === "ArrowLeft") goTo(centerIndexRef.current - 1);
    };
    window.addEventListener("keydown", onKey);

    // Exposed so the arrow / thumbnail buttons outside the canvas (plain
    // HTML) can drive the same ring.
    goToRef.current = goTo;

    let frameId = 0;
    const tick = () => {
      if (!dragging) {
        rotRef.current += (targetRef.current - rotRef.current) * SPRING;
      }
      ring.rotation.y = rotRef.current;
      parallaxSmoothXRef.current +=
        (parallaxTargetXRef.current - parallaxSmoothXRef.current) * PARALLAX_EASE;
      parallaxSmoothYRef.current +=
        (parallaxTargetYRef.current - parallaxSmoothYRef.current) * PARALLAX_EASE;
      tiltGroup.rotation.x = tiltRef.current + parallaxSmoothYRef.current * PARALLAX_AMOUNT_Y;
      tiltGroup.rotation.y = parallaxSmoothXRef.current * PARALLAX_AMOUNT_X;
      tiltGroup.rotation.z = tiltXRef.current;
      tiltGroup.position.set(ringPosXRef.current, ringPosYRef.current, 0);

      // Live FOV: cheap enough to just re-apply every frame, same as the
      // other dev-panel refs -- no need to special-case "did it change".
      if (camera.fov !== cameraFovRef.current) {
        camera.fov = cameraFovRef.current;
        camera.updateProjectionMatrix();
      }

      // Which project reads as "active" (caption, thumbnail highlight,
      // View-project link) is derived from the rotation itself every
      // frame -- same as the reference's `showActiveSlide()` rounding
      // `-currentRotation / angleBetweenSlides` -- rather than tracked as
      // its own locked state. Only touch React state on an actual change.
      const activeIdx = mod(Math.round(-rotRef.current / stepAngle), N);
      if (activeIdx !== centerIndexRef.current) {
        centerIndexRef.current = activeIdx;
        setCenterIndex(activeIdx);
      }

      // Dev-panel size/gap: re-applied every frame from the live refs, so
      // dragging a slider updates the scene on the very next frame with
      // no scene rebuild. Width and height scale independently off the
      // base geometry's own CARD_W/CARD_H -- uAspect is re-derived from
      // the live values every frame too, so the shader's aspect-corrected
      // rounded corners stay correct even once width and height no
      // longer share the same ratio they started with.
      const liveRadius = ringRadiusRef.current;
      const liveScaleX = cardSizeRef.current / CARD_W;
      const liveScaleY = cardHeightRef.current / CARD_H;
      const liveAspect = cardSizeRef.current / cardHeightRef.current;

      meshes.forEach((mesh) => {
        mesh.position.set(
          Math.sin(mesh.userData.angle) * liveRadius,
          0,
          Math.cos(mesh.userData.angle) * liveRadius,
        );
        mesh.scale.set(liveScaleX, liveScaleY, 1);
        mesh.material.uniforms.uCurve.value = curveRef.current;
        mesh.material.uniforms.uRadius.value = cornerRef.current;
        mesh.material.uniforms.uAspect.value = liveAspect;

        // Signed delta from "facing the camera" (world angle 0) -- the
        // card's own facing is fixed at creation (mesh.rotation.y =
        // its position angle) and the ring's rotation is inherited on
        // top of it, so this is purely how close that card's position
        // currently is to dead-centre, for the focus/dim blend.
        const d = angleDelta(0, mesh.userData.angle + rotRef.current);

        const focus = 1 - Math.min(1, Math.abs(d) / (stepAngle * FOCUS_WIDTH));
        mesh.material.uniforms.uFocus.value = Math.max(0, focus);

        // Exactly one video plays at a time -- the active/centred
        // card by index, not "focus above a threshold". During a fast
        // scroll rotRef can swing through several cards in a couple of
        // frames, so more than one used to cross the 0.6 focus threshold
        // before its neighbour's play() promise had a chance to resolve,
        // leaving two videos briefly playing (and visible) at once. Tying
        // playback to the same activeIdx the caption/thumbnail already
        // use keeps that gap -- exactly one active card -- constant no
        // matter how fast the ring is spinning.
        const video = videos[mesh.userData.index];
        if (video) {
          if (mesh.userData.index === activeIdx) video.play().catch(() => {});
          else video.pause();
        }
      });

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      if (!isMobile) window.removeEventListener("pointermove", onParallaxMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("pointerup", onClickUp);
      window.removeEventListener("keydown", onKey);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointerdown", onClickDown);
      container.removeEventListener("wheel", onWheel);
      if (wheelSnapTimer) clearTimeout(wheelSnapTimer);
      videos.forEach((v) => v && v.pause());
      meshes.forEach((mesh) => {
        mesh.material.uniforms.uMap.value?.dispose();
        mesh.material.dispose();
      });
      geometry.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
    // Only re-run if the actual project list identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, N, stepAngle]);

  const step = useCallback((dir) => {
    goToRef.current(centerIndexRef.current + dir);
  }, []);
  const goToIndex = useCallback((i) => {
    goToRef.current(i);
  }, []);

  if (N === 0) {
    return (
      <section className="tnf-imm3d-bg fixed inset-0">
        <SiteHeader />
        <div className="h-full grid place-items-center font-mono text-sm text-white/40">
          No immersive projects yet.
        </div>
      </section>
    );
  }

  const current = projects[centerIndex];
  const bgGradient = gradientColorsForProject(current.slug);

  const sceneContent = (
    <>
      <SiteHeader />

      {debugOn && (
        <DevPanel
          visible={panelVisible}
          onToggleVisible={onTogglePanel}
          cardSize={cardSize}
          cardHeight={cardHeight}
          ringRadius={ringRadius}
          curve={curve}
          corner={corner}
          tilt={tilt}
          tiltX={tiltX}
          cameraFov={cameraFov}
          ringPosX={ringPosX}
          ringPosY={ringPosY}
          bgOverride={bgOverride}
          onCardSizeChange={onCardSizeChange}
          onCardHeightChange={onCardHeightChange}
          onRingRadiusChange={onRingRadiusChange}
          onCurveChange={onCurveChange}
          onCornerChange={onCornerChange}
          onTiltChange={onTiltChange}
          onTiltXChange={onTiltXChange}
          onCameraFovChange={onCameraFovChange}
          onRingPosXChange={onRingPosXChange}
          onRingPosYChange={onRingPosYChange}
          onBgChange={onBgChange}
          onBgReset={onBgReset}
        />
      )}

      <div className="tnf-imm3d-floor" aria-hidden="true" />

      {/* The WebGL ring itself. */}
      <div ref={containerRef} className="absolute inset-0" />

      <div className="absolute right-[3vw] top-1/2 -translate-y-1/2 z-20 flex flex-col gap-3">
        <button type="button" onClick={() => step(-1)} aria-label="Previous project" className="tnf-imm3d-arrow">
          &lt;
        </button>
        <button type="button" onClick={() => step(1)} aria-label="Next project" className="tnf-imm3d-arrow">
          &gt;
        </button>
      </div>

      {/* Just the current project's name, big, bottom-left -- swaps as
          the ring spins past each one. */}
      <div className="absolute left-5 md:left-[3vw] bottom-[6vh] z-20 max-w-[80vw] md:max-w-[40vw] pointer-events-none">
        <span className="tnf-imm3d-title-lg block">{current.title}</span>
      </div>

      <div className="absolute right-5 md:right-[3vw] bottom-[6vh] z-20 flex items-end gap-2">
        {projects.map((p, i) => (
          <button
            key={p.slug}
            type="button"
            onClick={() => goToIndex(i)}
            aria-label={`Go to ${p.title}`}
            className={`tnf-imm3d-thumb ${i === centerIndex ? "tnf-imm3d-thumb-active" : ""}`}
          >
            {/* A video file can't be used as an <img> src -- the thumbnail
                only ever shows a still, never the raw video URL. */}
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.image} alt="" className="tnf-imm3d-thumb-media" />
            ) : null}
            <span className="tnf-imm3d-thumb-label">{p.title}</span>
          </button>
        ))}
      </div>
    </>
  );

  return (
    <section
      className="tnf-imm3d-bg fixed inset-0 overflow-hidden"
      style={
        bgOverride
          ? { background: bgOverride }
          : { "--imm-bg-a": bgGradient.a, "--imm-bg-b": bgGradient.b }
      }
    >
      {sceneContent}
    </section>
  );
}

// Dev-only tuning panel (only ever rendered when signed in as admin, same
// gate as the rest of the page's Editable fields) -- three live controls
// so the actual look can be dialed in in the browser instead of round-
// tripping a code change per guess: card size, the ring's radius (how
// close together the cards sit -- more "gap" between them the bigger it
// is), and the scene's background. The read-only field at the bottom is
// just the three current values in one copy-pasteable line.
function DevPanel({
  cardSize,
  cardHeight,
  ringRadius,
  curve,
  corner,
  tilt,
  tiltX,
  cameraFov,
  ringPosX,
  ringPosY,
  bgOverride,
  visible,
  onToggleVisible,
  onCardSizeChange,
  onCardHeightChange,
  onRingRadiusChange,
  onCurveChange,
  onCornerChange,
  onTiltChange,
  onTiltXChange,
  onCameraFovChange,
  onRingPosXChange,
  onRingPosYChange,
  onBgChange,
  onBgReset,
}) {
  if (!visible) {
    return (
      <button
        type="button"
        onClick={onToggleVisible}
        className="fixed top-24 left-5 z-30 rounded-lg border border-white/15 bg-black/70 px-3 py-2 font-mono text-[11px] text-white/70 backdrop-blur-sm"
      >
        Debug -- afficher
      </button>
    );
  }

  return (
    <div className="fixed top-24 left-5 z-30 w-64 space-y-3 rounded-lg border border-white/15 bg-black/70 p-4 font-mono text-[11px] text-white/80 backdrop-blur-sm">
      <p className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-white/50">
        <span>Debug -- carousel 3D</span>
        <button
          type="button"
          onClick={onToggleVisible}
          aria-label="Masquer le debug panel"
          className="text-white/50 normal-case tracking-normal hover:text-white/80"
        >
          &minus;
        </button>
      </p>

      <label className="block">
        <span className="flex justify-between">
          <span>Largeur</span>
          <span className="tabular-nums">{cardSize.toFixed(2)}</span>
        </span>
        <input
          type="range"
          min="1"
          max="16"
          step="0.1"
          value={cardSize}
          onChange={onCardSizeChange}
          className="mt-1 w-full"
        />
      </label>

      <label className="block">
        <span className="flex justify-between">
          <span>Hauteur</span>
          <span className="tabular-nums">{cardHeight.toFixed(2)}</span>
        </span>
        <input
          type="range"
          min="1"
          max="16"
          step="0.1"
          value={cardHeight}
          onChange={onCardHeightChange}
          className="mt-1 w-full"
        />
      </label>

      <label className="block">
        <span className="flex justify-between">
          <span>Gap (rayon)</span>
          <span className="tabular-nums">{ringRadius.toFixed(2)}</span>
        </span>
        <input
          type="range"
          min="0.5"
          max="10"
          step="0.1"
          value={ringRadius}
          onChange={onRingRadiusChange}
          className="mt-1 w-full"
        />
      </label>

      <label className="block">
        <span className="flex justify-between">
          <span>Courbure</span>
          <span className="tabular-nums">{curve.toFixed(2)}</span>
        </span>
        <input
          type="range"
          min="0"
          max="4"
          step="0.05"
          value={curve}
          onChange={onCurveChange}
          className="mt-1 w-full"
        />
      </label>

      <label className="block">
        <span className="flex justify-between">
          <span>Arrondi</span>
          <span className="tabular-nums">{corner.toFixed(2)}</span>
        </span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.02"
          value={corner}
          onChange={onCornerChange}
          className="mt-1 w-full"
        />
      </label>

      <label className="block">
        <span className="flex justify-between">
          <span>Inclinaison (Y)</span>
          <span className="tabular-nums">{tilt.toFixed(2)}</span>
        </span>
        <input
          type="range"
          min="-0.5"
          max="0.5"
          step="0.01"
          value={tilt}
          onChange={onTiltChange}
          className="mt-1 w-full"
        />
      </label>

      <label className="block">
        <span className="flex justify-between">
          <span>Inclinaison (X)</span>
          <span className="tabular-nums">{tiltX.toFixed(2)}</span>
        </span>
        <input
          type="range"
          min="-0.5"
          max="0.5"
          step="0.01"
          value={tiltX}
          onChange={onTiltXChange}
          className="mt-1 w-full"
        />
      </label>

      <label className="block">
        <span className="flex justify-between">
          <span>Champ de vision (FOV)</span>
          <span className="tabular-nums">{cameraFov.toFixed(0)}</span>
        </span>
        <input
          type="range"
          min="30"
          max="90"
          step="1"
          value={cameraFov}
          onChange={onCameraFovChange}
          className="mt-1 w-full"
        />
      </label>

      <label className="block">
        <span className="flex justify-between">
          <span>Position X</span>
          <span className="tabular-nums">{ringPosX.toFixed(2)}</span>
        </span>
        <input
          type="range"
          min="-6"
          max="6"
          step="0.1"
          value={ringPosX}
          onChange={onRingPosXChange}
          className="mt-1 w-full"
        />
      </label>

      <label className="block">
        <span className="flex justify-between">
          <span>Position Y</span>
          <span className="tabular-nums">{ringPosY.toFixed(2)}</span>
        </span>
        <input
          type="range"
          min="-6"
          max="6"
          step="0.1"
          value={ringPosY}
          onChange={onRingPosYChange}
          className="mt-1 w-full"
        />
      </label>

      <label className="block">
        <span>Fond</span>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="color"
            value={bgOverride ?? "#0b2530"}
            onChange={onBgChange}
            className="h-7 w-12 rounded border border-white/20 bg-transparent"
          />
          <button
            type="button"
            onClick={onBgReset}
            className="text-[10px] text-white/50 underline underline-offset-2"
          >
            Réinitialiser
          </button>
        </div>
      </label>

      <input
        readOnly
        value={`CARD_W=${cardSize.toFixed(2)} CARD_H=${cardHeight.toFixed(2)} RING_RADIUS=${ringRadius.toFixed(2)} CURVE=${curve.toFixed(2)} CORNER_RADIUS=${corner.toFixed(2)} RING_TILT=${tilt.toFixed(2)} RING_TILT_X=${tiltX.toFixed(2)} CAMERA_FOV=${cameraFov.toFixed(0)} RING_POS_X=${ringPosX.toFixed(2)} RING_POS_Y=${ringPosY.toFixed(2)} BG=${bgOverride ?? "défaut"}`}
        onFocus={(e) => e.target.select()}
        className="w-full rounded border border-white/15 bg-white/5 px-2 py-1 text-[10px] text-white/70"
      />
    </div>
  );
}
