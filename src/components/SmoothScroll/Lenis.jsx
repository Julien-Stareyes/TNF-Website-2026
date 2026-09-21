"use client";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/dist/ScrollTrigger";
import { useEffect, useRef } from "react";
import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";

gsap.registerPlugin(ScrollTrigger);

const LenisSmoothScroll = () => {
  const lenisRef = useRef(null);

  useEffect(() => {
    function update(time) {
      lenisRef.current?.lenis?.raf(time * 1000);
    }

    gsap.ticker.add(update);

    // Refresh ScrollTrigger on mount (handles route changes)
    ScrollTrigger.refresh();

    // Expose the Lenis instance on window so page components (e.g. the
    // ScrollScramble section slider) can drive scrollTo without relying on
    // context propagation from a portal-rendered provider.
    const t = setInterval(() => {
      if (lenisRef.current?.lenis) {
        window.__lenis = lenisRef.current.lenis;
        clearInterval(t);
      }
    }, 50);

    return () => {
      clearInterval(t);
      gsap.ticker.remove(update);
      if (window.__lenis === lenisRef.current?.lenis) delete window.__lenis;
    };
  }, []);

  return (
    <ReactLenis
      root
      options={{
        autoRaf: false,
        duration: 1.2,
        touchMultiplier: 2,
        smoothTouch: true,
      }}
      ref={lenisRef}
    />
  );
};

export default LenisSmoothScroll;
