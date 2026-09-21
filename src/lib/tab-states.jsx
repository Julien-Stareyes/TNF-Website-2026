"use client";
import { createContext, useContext } from "react";

// Tab publish state, read once in the root layout and shared down so the
// header can drop links for sections that are hidden. Defaults to
// everything live, which is what an un-provided tree should render.
const TabStatesContext = createContext({
  image: "live",
  immersive: "live",
  index: "live",
  info: "live",
});

export function TabStatesProvider({ value, children }) {
  return (
    <TabStatesContext.Provider value={value}>
      {children}
    </TabStatesContext.Provider>
  );
}

export const useTabStates = () => useContext(TabStatesContext);
