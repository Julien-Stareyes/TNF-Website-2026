// Ready-made row arrangements. Picking one is the first decision when
// adding a row — it settles how many things sit side by side and how
// wide each is. Everything stays editable afterwards.
//
// `slots` is the shape: 'm' for media, 't' for text, with the column
// span each one takes out of 12.

export const ROW_PRESETS = [
  {
    key: "full",
    label: "Full",
    slots: [{ kind: "m", span: 12 }],
  },
  {
    key: "halves",
    label: "Two equal",
    slots: [
      { kind: "m", span: 6 },
      { kind: "m", span: 6 },
    ],
  },
  {
    key: "wide-narrow",
    label: "Wide + narrow",
    slots: [
      { kind: "m", span: 8 },
      { kind: "m", span: 4 },
    ],
  },
  {
    key: "narrow-wide",
    label: "Narrow + wide",
    slots: [
      { kind: "m", span: 4 },
      { kind: "m", span: 8 },
    ],
  },
  {
    key: "thirds",
    label: "Three across",
    slots: [
      { kind: "m", span: 4 },
      { kind: "m", span: 4 },
      { kind: "m", span: 4 },
    ],
  },
  {
    key: "quarters",
    label: "Four across",
    slots: [
      { kind: "m", span: 3 },
      { kind: "m", span: 3 },
      { kind: "m", span: 3 },
      { kind: "m", span: 3 },
    ],
  },
  {
    key: "media-text",
    label: "Media + text",
    slots: [
      { kind: "m", span: 8 },
      { kind: "t", span: 4 },
    ],
  },
  {
    key: "text-media",
    label: "Text + media",
    slots: [
      { kind: "t", span: 4 },
      { kind: "m", span: 8 },
    ],
  },
  {
    key: "two-media-text",
    label: "Two media + text",
    slots: [
      { kind: "m", span: 4 },
      { kind: "m", span: 4 },
      { kind: "t", span: 4 },
    ],
  },
  {
    key: "text-two-media",
    label: "Text + two media",
    slots: [
      { kind: "t", span: 4 },
      { kind: "m", span: 4 },
      { kind: "m", span: 4 },
    ],
  },
  {
    key: "caption-media-caption",
    label: "Media between captions",
    slots: [
      { kind: "t", span: 3 },
      { kind: "m", span: 6 },
      { kind: "t", span: 3 },
    ],
  },
  {
    key: "copy",
    label: "Copy only",
    slots: [{ kind: "t", span: 12 }],
  },
];

// Reshape an existing row onto a preset, carrying media across so
// changing your mind about the arrangement doesn't lose the pictures.
export function applyPreset(row, preset, { newMedia, newText }) {
  const pool = (row?.items ?? []).filter((it) => it.kind === "media");
  let taken = 0;
  const items = preset.slots.map((slot) => {
    if (slot.kind === "t") return newText({ span: slot.span });
    const reused = pool[taken++];
    return reused
      ? { ...reused, span: slot.span }
      : newMedia({ span: slot.span });
  });
  return { ...row, items, preset: preset.key };
}
