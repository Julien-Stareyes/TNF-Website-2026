"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { EditModeProvider, Editable, useEditMode } from "@/lib/edit-mode";
import { DEFAULT_ASPECT, knownAspect, useAspectProbe } from "@/lib/media-aspect";
import { markMuted } from "@/lib/muted-video";

const mod = (n, m) => ((n % m) + m) % m;

// How far off-centre a card is still drawn.
const VISIBLE_SPAN = 2;
// One slot further out on each side stays mounted but invisible. Slots are
// recycled out there, so a project's video is always loaded well before it
// reaches the centre and no swap ever happens in view.
const MOUNT_SPAN = VISIBLE_SPAN + 1;

const PERSPECTIVE = 2200;

// Where a card rests when it isn't the hero, as a share of its own width
// out from the centre, and how tall it stands there. The hero's own edge
// is at 50%, so the first one stands clear of it.
const LINE_X = [59, 68];
const LINE_H = [0.82, 0.64];
// Each one further out sits back further, so the stack reads as depth.
const LINE_O = [0.5, 0.25];

// A resting card is squeezed to this width and given a slight turn, so it
// reads as a spine standing beside the hero and widens back out on its way
// to the centre.
//
// Rotating it until it went edge-on instead put its thickness at the mercy
// of a near-degenerate projection — a couple of px that the compositor
// would round away and back mid-step, which is why the lines blinked. The
// width is now stated outright and cannot collapse.
const REST_W = 36;
const REST_ROT = 16;

// Cards all share one width — the width a 16:9 card has always had — and
// take their height from the file. A 16:9 card is the widest shape there
// is, so it keeps that width untouched; anything taller would run past the
// caption at the same width, so its height is capped first and only then
// does its width come down. The cap is the distance to the caption, which
// sits 28vh below the middle against a 52vh stage.

// The box for one card: the shared width, the height its file asks for,
// and — only if that would outgrow the stage — a width brought down to
// keep the shape.
function boxFor(cardW, stageH, aspect) {
  if (!cardW) return { w: 0, h: 0 };
  const a = aspect ?? DEFAULT_ASPECT;
  const maxH = stageH * 1.05;
  const h = cardW / a;
  return h <= maxH ? { w: cardW, h } : { w: maxH * a, h: maxH };
}

const TURN_MS = 1250;
// Eased at both ends rather than off a hard start, so a card gathers pace
// out of its rest position and settles into the centre instead of
// snapping there.
const EASE = "cubic-bezier(0.5, 0, 0.2, 1)";
// The fades ride the turn rather than finishing ahead of it.
const FADE_MS = Math.round(TURN_MS * 0.6);

export default function ImmersiveCarousel({ projects, intro: initialIntro }) {
  const [intro, setIntro] = useState(initialIntro);

  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === "tnf-preview:immersive" && e.data.payload)
        setIntro(e.data.payload.intro ?? "");
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <EditModeProvider>
      <CarouselView projects={projects} intro={intro} />
    </EditModeProvider>
  );
}

function CarouselView({ projects, intro }) {
  const router = useRouter();
  const { enabled } = useEditMode();
  const [center, setCenter] = useState(0);
  const N = projects.length;

  // `center` counts steps and is never wrapped. Wrapping it meant a card
  // had to jump to the far side whenever the shortest way round the loop
  // flipped, and with only a handful of projects that flip happened in
  // full view — the card visibly slid across behind the hero, and the slot
  // it left behind stood empty.
  // The resting angle depends on how wide a card actually is, so the stage
  // is measured rather than guessed.
  const stageRef = useRef(null);
  const [cardW, setCardW] = useState(0);
  const [stageH, setStageH] = useState(0);
  // Shapes reported by the cards' own media, keyed by slug.
  const [aspects, setAspects] = useState({});
  const noteAspect = useCallback(
    (slug, a) =>
      setAspects((prev) => (prev[slug] === a ? prev : { ...prev, [slug]: a })),
    []
  );
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const read = () => {
      setStageH(el.clientHeight);
      setCardW((el.clientHeight * 16) / 9);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const step = useCallback(
    (dir) => {
      if (N === 0) return;
      setCenter((c) => c + dir);
    },
    [N]
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  // Wheel steps one card at a time. A trackpad fires dozens of small
  // deltas per flick, so a lock holds until the card has landed —
  // otherwise one gesture spins through the whole stack.
  const wheelLock = useRef(false);
  useEffect(() => {
    const onWheel = (e) => {
      const delta =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 8) return;
      e.preventDefault();
      if (wheelLock.current) return;
      wheelLock.current = true;
      step(delta > 0 ? 1 : -1);
      setTimeout(() => {
        wheelLock.current = false;
      }, TURN_MS);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [step]);

  if (N === 0) {
    return (
      <section className="fixed inset-0 bg-white text-black">
        <SiteHeader theme="light" />
        <div className="h-full grid place-items-center font-mono text-sm text-black/40">
          No immersive projects yet.
        </div>
      </section>
    );
  }

  const centerIndex = mod(center, N);
  const current = projects[centerIndex];

  // The belt is a fixed run of slots either side of the centre, and a slot
  // takes its project modulo the list. So with four projects the fifth slot
  // simply shows the first one again: the stack is always full, no matter
  // how few projects there are, and the same project can legitimately
  // appear on both sides at once.
  //
  // A slot's offset is `slot - center`, which only ever moves by one per
  // step — it never wraps, so nothing slides across the stage.
  const slots = [];
  for (let off = -MOUNT_SPAN; off <= MOUNT_SPAN; off++)
    slots.push({ slot: center + off, off });

  return (
    <section className="fixed inset-0 overflow-hidden bg-white text-black">
      <SiteHeader theme="light" />

      {/* Stage */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          ref={stageRef}
          className="relative w-full h-[46vh] md:h-[52vh]"
          style={{
            perspective: `${PERSPECTIVE}px`,
            transformStyle: "preserve-3d",
          }}
        >
          {slots.map(({ slot, off }) => {
            const project = projects[mod(slot, N)];
            const distance = Math.abs(off);
            const isCenter = off === 0;
            const beyond = distance > VISIBLE_SPAN;
            const dir = Math.sign(off);
            // Which rule this card rests on.
            const rest = Math.max(0, Math.min(distance, VISIBLE_SPAN) - 1);
            // Offsets are in px off the shared width, not a percentage of
            // each card's own box — cards differ in height now, and a card
            // that had to narrow would otherwise rest out of line with the
            // others.
            const restX =
              (cardW *
                (LINE_X[rest] + (beyond ? (distance - VISIBLE_SPAN) * 9 : 0))) /
              100;
            const box = boxFor(cardW, stageH, aspects[project.slug]);

            return (
              // Away from the centre a card is folded flat to nothing and
              // its rule stands in for it. Standing it at rotateY(90deg)
              // instead was not enough: a card that far off the view axis
              // is seen at an angle even when it is edge-on, so the
              // perspective drew it as a wide wedge. Stepping unfolds it
              // and carries it to the centre.
              <button
                key={slot}
                type="button"
                onClick={() =>
                  isCenter ? router.push(`/${project.slug}`) : step(off)
                }
                aria-label={
                  isCenter ? `Open ${project.title}` : `Show ${project.title}`
                }
                aria-hidden={!isCenter}
                tabIndex={isCenter ? 0 : -1}
                className="absolute left-1/2 top-1/2 overflow-hidden shadow-2xl cursor-pointer bg-white"
                style={{
                  width: box.w || undefined,
                  height: box.h || undefined,
                  transform: [
                    "translate(-50%, -50%)",
                    `translateX(${isCenter ? 0 : dir * restX}px)`,
                    `rotateY(${isCenter ? 0 : dir * -REST_ROT}deg)`,
                    `scale(${isCenter ? 1 : box.w ? REST_W / box.w : 0}, ${
                      isCenter ? 1 : LINE_H[rest]
                    })`,
                  ].join(" "),
                  zIndex: isCenter ? 20 : 10 - distance,
                  // The squeeze is derived from the measured card width, so
                  // side cards stay out of sight until it is known rather
                  // than flashing up full width for a frame.
                  opacity:
                    beyond || (!isCenter && !cardW)
                      ? 0
                      : isCenter
                        ? 1
                        : LINE_O[rest],
                  pointerEvents: isCenter ? "auto" : "none",
                  backfaceVisibility: "hidden",
                  willChange: "transform",
                  // The leaving card and the arriving one travel the same
                  // way round, so they never meet — no need to stagger
                  // them, which used to leave the centre empty mid-step.
                  transitionProperty: "transform, opacity",
                  transitionDuration: `${TURN_MS}ms, ${FADE_MS}ms`,
                  transitionTimingFunction: EASE,
                }}
              >
                <CardMedia
                  project={project}
                  isCenter={isCenter}
                  onAspect={noteAspect}
                />
                {/* Held back at a low opacity, a light project — anything
                    still on the placeholder — would wash out against the
                    white entirely. This keeps a resting card dark enough to
                    register whatever is on it, and clears as it opens. */}
                <span
                  aria-hidden="true"
                  className="absolute inset-0 bg-neutral-900 pointer-events-none"
                  style={{
                    opacity: isCenter ? 0 : 0.45,
                    transition: `opacity ${FADE_MS}ms ${EASE}`,
                  }}
                />
              </button>
            );
          })}

          {/* A three-pixel line is no click target, so each resting
              position carries an invisible strip you can actually hit.
              Purely a hit area — it draws nothing, so it cannot go astray
              on screen the way the drawn rules did. */}
          {[-1, 1].map((s2) =>
            LINE_X.map((x, r) => (
              <button
                key={`hit-${s2}-${r}`}
                type="button"
                onClick={() => step(s2 * (r + 1))}
                aria-label={`Show ${
                  projects[mod(center + s2 * (r + 1), N)].title
                }`}
                className="absolute left-1/2 top-1/2 grid place-items-center cursor-pointer"
                style={{
                  width: cardW || undefined,
                  height: stageH || undefined,
                  transform: `translate(-50%, -50%) translateX(${
                    (s2 * x * cardW) / 100
                  }px)`,
                  zIndex: 15,
                  pointerEvents: "none",
                }}
              >
                <span
                  className="block w-6 pointer-events-auto"
                  style={{ height: `${LINE_H[r] * 140}%` }}
                />
              </button>
            ))
          )}
        </div>
      </div>

      {/* Caption under the centre card. It takes the card's measured width
          so the byline and year sit flush with its edges — which now means
          following the card, since a portrait one is narrower. */}
      <div
        className="absolute left-1/2 -translate-x-1/2 top-[calc(50%+25vh)] md:top-[calc(50%+28vh)] max-w-[92vw] pointer-events-none"
        style={{ width: boxFor(cardW, stageH, aspects[current.slug]).w || undefined }}
      >
        <div className="flex items-baseline justify-between font-mono text-[9px] md:text-[0.6vw] uppercase tracking-[0.18em] text-black/45">
          <span>T.N.F</span>
          <span className="tabular-nums">{current.year ?? ""}</span>
        </div>
        <p className="mt-3 text-center font-mono uppercase tracking-[0.16em] text-[12px] md:text-[0.85vw]">
          {current.title}
        </p>
      </div>

      {/* Arrows */}
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label="Previous project"
        className="absolute left-[3vw] top-1/2 -translate-y-1/2 z-20 font-mono text-[18px] md:text-[1.2vw] text-black/60 hover:text-black transition-colors"
      >
        &lt;
      </button>
      <button
        type="button"
        onClick={() => step(1)}
        aria-label="Next project"
        className="absolute right-[3vw] top-1/2 -translate-y-1/2 z-20 font-mono text-[18px] md:text-[1.2vw] text-black/60 hover:text-black transition-colors"
      >
        &gt;
      </button>

      {/* Dots */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-[8vh] z-20 flex items-center gap-2">
        {projects.map((p, i) => (
          <button
            key={p.slug}
            type="button"
            // Step to the nearest slot showing this project, so the belt
            // turns the short way rather than unwinding to a fixed index.
            onClick={() => {
              const raw = mod(i - centerIndex, N);
              step(raw > N / 2 ? raw - N : raw);
            }}
            aria-label={`Go to ${p.title}`}
            className={`rounded-full transition-all duration-300 ${
              i === centerIndex ? "w-1.5 h-1.5 bg-black" : "w-1 h-1 bg-black/25"
            }`}
          />
        ))}
      </div>

      {/* Intro copy, bottom-left */}
      <div className="absolute left-5 md:left-[3vw] bottom-[6vh] max-w-[74vw] md:max-w-[24vw] z-20">
        <Editable
          as="p"
          multiline
          field="intro"
          value={intro}
          className="font-mono leading-[1.6] text-[12px] md:text-[0.78vw]"
          placeholder={enabled ? "Intro copy" : undefined}
        />
      </div>
    </section>
  );
}

// Picks the best available media for a card and only plays the one in
// front, so four videos don't compete for bandwidth.
function CardMedia({ project, isCenter, onAspect }) {
  const video = project.video ?? null;
  const image = project.image ?? null;
  const ref = useRef(null);
  const url = video ?? image;
  const { aspect, onLoad, onLoadedMetadata, probe } = useAspectProbe(url);

  // The video element is held for play/pause as well as measured.
  const attach = useCallback(
    (el) => {
      ref.current = el;
      probe(el);
    },
    [probe]
  );

  // The card's box is set by the parent, so the shape has to travel up.
  useEffect(() => {
    const a = aspect ?? knownAspect(url);
    if (a) onAspect?.(project.slug, a);
  }, [aspect, url, onAspect, project.slug]);

  // Play state is driven through the element, never through `src` or
  // `autoPlay`. Changing either tears the video down and rebuilds it,
  // which showed as a black flash the moment a card reached the centre.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (isCenter) el.play().catch(() => {});
    else el.pause();
  }, [isCenter]);

  if (video) {
    return (
      <video
        ref={(el) => { markMuted(el); attach(el); }}
        src={`${video}#t=0.1`}
        muted
        loop
        playsInline
        preload="auto"
        onLoadedMetadata={onLoadedMetadata}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      />
    );
  }
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={probe}
        src={image}
        alt=""
        onLoad={onLoad}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      />
    );
  }
  return (
    <div className="absolute inset-0 grid place-items-center gap-1 bg-neutral-100 border border-black/10 font-mono uppercase tracking-[0.16em] text-black/35">
      <span className="text-[11px]">{project.title}</span>
      <span className="text-[9px] text-black/25">No media yet</span>
    </div>
  );
}
