import SiteHeader from "@/components/SiteHeader";

// Holding screen for a section that's been parked from the admin. Keeps
// the site's chrome so the visitor stays oriented rather than hitting a
// dead end.
export default function ComingSoon({ title }) {
  return (
    <section className="fixed inset-0 bg-white text-black">
      <SiteHeader theme="light" />
      <div className="h-full grid place-content-center gap-3 px-5 text-center">
        <p className="font-mono font-light uppercase tracking-[0.16em] text-[11px] md:text-[12px] text-black/40">
          {title}
        </p>
        <p className="font-mono uppercase tracking-[0.12em] text-[15px] md:text-[23px]">
          Coming soon
        </p>
      </div>
    </section>
  );
}
