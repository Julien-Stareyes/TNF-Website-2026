"use client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// Visual-editing bridge. A public page rendered inside the admin's preview
// iframe can be switched into edit mode by the parent; from then on every
// <Editable> field becomes contentEditable and streams its changes back up
// over postMessage. The page never writes to the DB itself — the admin
// owns the draft state and the Save button.
const EditModeContext = createContext({ enabled: false, emit: () => {} });

export function EditModeProvider({ children }) {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    // Only meaningful inside an iframe. A standalone visitor never gets
    // edit affordances, no matter what they put in the URL.
    if (typeof window === "undefined" || window.parent === window) return;
    const onMsg = (e) => {
      if (e.data?.type === "tnf-edit:enable") setEnabled(true);
      else if (e.data?.type === "tnf-edit:disable") setEnabled(false);
    };
    window.addEventListener("message", onMsg);
    window.parent.postMessage({ type: "tnf-preview:ready" }, "*");
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const value = useMemo(
    () => ({
      enabled,
      emit(field, v) {
        window.parent?.postMessage(
          { type: "tnf-edit:change", field, value: v },
          "*"
        );
      },
      request(action, field, payload) {
        window.parent?.postMessage(
          { type: "tnf-edit:request", action, field, payload },
          "*"
        );
      },
    }),
    [enabled]
  );

  return (
    <EditModeContext.Provider value={value}>
      {children}
      {enabled && <EditModeStyles />}
    </EditModeContext.Provider>
  );
}

export const useEditMode = () => useContext(EditModeContext);

// Hover/focus affordances, injected only while editing so the public page
// ships none of this.
function EditModeStyles() {
  return (
    <style>{`
      [data-tnf-editable] {
        outline: 1px dashed rgba(120,120,120,0.45);
        outline-offset: 3px;
        border-radius: 2px;
        transition: outline-color 120ms, background-color 120ms;
        cursor: text;
      }
      [data-tnf-editable]:hover {
        outline-color: #c67a2e;
        background-color: rgba(198,122,46,0.06);
      }
      [data-tnf-editable]:focus {
        outline: 2px solid #c67a2e;
        outline-offset: 3px;
        background-color: rgba(198,122,46,0.08);
      }
      [data-tnf-action] {
        cursor: pointer;
        outline: 1px dashed rgba(120,120,120,0.45);
        outline-offset: 3px;
      }
      [data-tnf-action]:hover { outline: 2px solid #c67a2e; }
      [data-tnf-draggable] { cursor: grab; }
      [data-tnf-draggable]:active { cursor: grabbing; }
      [data-tnf-drop-before] { box-shadow: -3px 0 0 0 #c67a2e; }
      [data-tnf-drop-after] { box-shadow: 3px 0 0 0 #c67a2e; }
    `}</style>
  );
}

// A text node the operator can click into and type over. Renders as plain
// text when edit mode is off, so the public page is untouched.
export function Editable({
  field,
  value,
  as: Tag = "span",
  multiline = false,
  className,
  style,
  placeholder,
}) {
  const { enabled, emit } = useEditMode();
  const ref = useRef(null);

  // Sync external updates into the DOM, but never while the caret is in
  // this node — rewriting textContent there would collapse the selection.
  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    const next = value ?? "";
    if (el.textContent !== next) el.textContent = next;
  }, [value, enabled]);

  if (!enabled) {
    return (
      <Tag className={className} style={style}>
        {value}
      </Tag>
    );
  }

  return (
    <Tag
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-tnf-editable={field}
      data-placeholder={placeholder}
      className={className}
      style={style}
      onInput={(e) => emit(field, e.currentTarget.textContent)}
      onKeyDown={(e) => {
        // Single-line fields shouldn't accept newlines; Escape drops focus.
        if (!multiline && e.key === "Enter") e.preventDefault();
        if (e.key === "Escape") e.currentTarget.blur();
      }}
      onPaste={(e) => {
        // Paste as plain text so pasted markup can't leak into content.
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
      }}
    />
  );
}
