// Shown only to a signed-in operator, on a section that is parked. Without
// it the page looks live to whoever set it to Coming soon — they see the
// real thing, because that is the point of staying editable while offline,
// and have no way to tell that a visitor doesn't.
export default function ParkedNotice() {
  return (
    <div className="fixed left-5 bottom-3 z-[60] pointer-events-none">
      <span className="flex items-center gap-[0.6em] font-mono font-light uppercase tracking-[0.14em] text-[10px] leading-none px-2.5 py-1.5 bg-black/80 text-white rounded-full">
        <span
          aria-hidden="true"
          className="inline-block w-[0.4em] h-[0.4em] rounded-full"
          style={{ background: "var(--color-accent)" }}
        />
        Offline — visitors see Coming soon
      </span>
    </div>
  );
}
