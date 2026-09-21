"use client";

import { ViewTransition } from "react";

// Every route segment remounts inside `template.jsx` on navigation (unlike
// layout.js, which persists) — that remount is what gives the browser's
// View Transitions API an old tree and a new one to snapshot and animate
// between. `enter`/`exit` are view-transition *classes*: the actual
// animations they trigger live in globals.css as
// `::view-transition-old(.page-exit)` / `::view-transition-new(.page-enter)`.
export default function Template({ children }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {children}
    </ViewTransition>
  );
}
