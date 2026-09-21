"use client";
import { useEffect, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import Logo3D from "@/components/Logo3D";
import LogoMarquee from "@/components/LogoMarquee";

// Info page -- the studio's 3D mark, centered, filling a single fixed
// viewport (no scroll: `h-[100svh] overflow-hidden`, since there's
// nothing below to scroll to), flanked by a manifesto/contact block on
// the left and a services blurb on the right, with a looping logo strip
// along the bottom. Every text block blurs into focus on its own stagger
// (`.tnf-word-reveal` / `.tnf-block-reveal`, from globals.css) rather than
// appearing all at once.
const WORD_STEP_MS = 45;

const RevealWords = ({ text, className, delayStart = 0 }) => {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <span className={className}>
      {words.map((word, i) => (
        // The space between words has to be a plain text node *outside*
        // the word's own span, not the last character inside it -- a
        // trailing space at the end of an inline-block box (tnf-word-reveal
        // sets display: inline-block) gets collapsed away by the browser,
        // which is what glued every word together with no gap at all.
        <span key={i}>
          <span
            className="tnf-word-reveal"
            style={{ animationDelay: `${delayStart + i * WORD_STEP_MS}ms` }}
          >
            {word}
          </span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
};

const TITLE =
  "CAMPAIGNS, OBJECTS AND EXPERIENCES CRAFTED WITH VISION.";
// Fallbacks only -- the real copy comes from the "info" settings blob
// (see lib/settings.js's INFO_DEFAULTS), edited at /admin -> Info.
const DEFAULT_SERVICES_ITEMS = [
  "Lorem ipsum dolor sit amet",
  "Consectetur adipiscing elit",
  "Sed do eiusmod tempor incididunt",
  "Ut labore et dolore magna aliqua",
  "Ut enim ad minim veniam",
];
const DEFAULT_ABOUT_BODY =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

// Same group-hover-blur treatment as the full-screen menu's nav links
// (see MenuLink in SiteMenu.jsx): hovering one contact line blurs and
// dims the other two, driven from real mouseenter/mouseleave rather than
// a CSS :hover/:has() combo. The entrance animation (`.tnf-block-reveal`,
// opacity + filter, `forwards`) has to live on a separate wrapper from
// the hover-driven opacity/filter -- both would otherwise animate the
// exact same properties on the exact same element, and the CSS animation
// (which never truly "ends" under `forwards`) always wins, so the hover
// style was being applied but had no visible effect.
const ContactLink = ({ href, dimmed, onHoverChange, delayMs, children }) => (
  <span
    className="tnf-block-reveal block w-fit"
    style={{ animationDelay: `${delayMs}ms` }}
  >
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      className="block hover:text-black transition-colors whitespace-nowrap w-fit"
      style={{
        filter: dimmed ? "blur(1.5px)" : "blur(0px)",
        opacity: dimmed ? 0.35 : 1,
        transition: "filter 300ms ease, opacity 300ms ease, color 300ms ease",
      }}
    >
      {children}
    </a>
  </span>
);

export default function InfoPage({ info }) {
  const titleWordCount = TITLE.split(/\s+/).filter(Boolean).length;
  const contactDelay = 150 + titleWordCount * WORD_STEP_MS + 250;
  const [hoveredContact, setHoveredContact] = useState(null);

  // The server passes down the saved "info" settings blob; the admin's
  // live-preview iframe (SplitPreview, messageType="tnf-preview:info")
  // overrides it with the in-progress draft on every keystroke so an
  // operator sees unsaved edits immediately.
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    window.parent?.postMessage({ type: "tnf-preview:ready" }, "*");
    const onMsg = (e) => {
      if (e.data?.type === "tnf-preview:info") setDraft(e.data.payload);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  const active = draft ?? info ?? {};
  const aboutBody = active.aboutBody || DEFAULT_ABOUT_BODY;
  const servicesItems = active.servicesItems?.length
    ? active.servicesItems
    : DEFAULT_SERVICES_ITEMS;
  const logos = active.logos ?? [];
  const aboutWordCount = aboutBody.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="relative w-full h-[100svh] overflow-hidden bg-white text-black font-mono font-light">
      <SiteHeader theme="light" />

      {/* Left -- manifesto line + contact. Vertically centered, same band
          as the logo. */}
      <div className="absolute left-8 md:left-[6vw] top-1/2 -translate-y-1/2 z-10 max-w-[26ch] md:max-w-[30ch]">
        <span
          className="tnf-block-reveal block w-fit"
          style={{ animationDelay: "0ms" }}
        >
          <img
            src="/assets/unreal-silver-badge.webp"
            alt="Unreal Engine Silver Service Partner 2026"
            className="h-9 md:h-10 w-auto"
          />
        </span>
        <RevealWords
          text={TITLE}
          delayStart={150}
          className="block mt-5 uppercase leading-[1.25] text-[18px] md:text-[22px]"
        />
        <div className="mt-6 flex flex-col gap-1 text-[12px] md:text-[13px] text-black/80">
          <ContactLink
            href="mailto:contact@thenewface.io"
            delayMs={contactDelay}
            dimmed={hoveredContact !== null && hoveredContact !== "mail"}
            onHoverChange={(on) => setHoveredContact(on ? "mail" : null)}
          >
            contact@thenewface.io
          </ContactLink>
          <ContactLink
            href="tel:+33699316051"
            delayMs={contactDelay + 120}
            dimmed={hoveredContact !== null && hoveredContact !== "tel"}
            onHoverChange={(on) => setHoveredContact(on ? "tel" : null)}
          >
            + 33 6 99 31 60 51
          </ContactLink>
          <ContactLink
            href="https://www.google.com/maps/search/?api=1&query=23+Rue+des+Petits+Hotels%2C+75010+Paris"
            delayMs={contactDelay + 240}
            dimmed={hoveredContact !== null && hoveredContact !== "address"}
            onHoverChange={(on) => setHoveredContact(on ? "address" : null)}
          >
            23 Rue des Petits Hotels, 75010, Paris
          </ContactLink>
        </div>
      </div>

      {/* Center -- the 3D mark. */}
      <div className="relative w-full h-full max-w-[2000px] mx-auto">
        <Logo3D />
      </div>

      {/* Right -- about + services. Same vertical band as the left column. */}
      <div className="absolute right-8 md:right-[6vw] top-1/2 -translate-y-1/2 z-10 max-w-[32ch] md:max-w-[38ch]">
        <span
          className="tnf-block-reveal block uppercase tracking-[0.14em] text-[12px] md:text-[13px]"
          style={{ animationDelay: "300ms" }}
        >
          About
        </span>
        <RevealWords
          text={aboutBody}
          delayStart={450}
          className="mt-3 block leading-relaxed text-[12px] md:text-[13px] text-black/80"
        />

        {/* A separate "Services" block, same label treatment as About
            above it, staggered in once About's word-by-word reveal ends. */}
        <span
          className="tnf-block-reveal block uppercase tracking-[0.14em] text-[12px] md:text-[13px] mt-8"
          style={{ animationDelay: `${450 + aboutWordCount * WORD_STEP_MS + 150}ms` }}
        >
          Services
        </span>
        <ul className="mt-3 flex flex-col gap-1 text-[12px] md:text-[13px] text-black/80">
          {servicesItems.map((item, i) => (
            <li
              key={`${i}-${item}`}
              className="tnf-block-reveal flex items-baseline gap-2"
              style={{
                animationDelay: `${450 + aboutWordCount * WORD_STEP_MS + 300 + i * 90}ms`,
              }}
            >
              <span aria-hidden="true">—</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Bottom -- looping logo strip, sitting above SiteHeader's own
          persistent "Creative Studio" / "Paris" bar -- centered and
          narrow, so it never collides with that bar's far-left/far-right
          text even with extra clearance below it. */}
      <div
        className="tnf-block-reveal absolute inset-x-0 bottom-12 md:bottom-[6vh] z-10 flex justify-center"
        style={{ animationDelay: "900ms" }}
      >
        <LogoMarquee logos={logos} />
      </div>
    </div>
  );
}
