import * as React from "react";
import { UndoIcon } from "@hybrid/ui";

// Authored preview for the otherwise-invisible 20px stroke icon: render it at
// display sizes in the brand indigo so the card shows a real glyph, not a blank.
export const Sizes = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 24, padding: 32, background: "#fff", color: "#1d4ed8" }}>
    <UndoIcon width={48} height={48} />
    <UndoIcon width={32} height={32} />
    <UndoIcon width={24} height={24} />
    <span style={{ marginLeft: 8, color: "#1c1917", fontFamily: "system-ui, sans-serif", fontSize: 13, fontWeight: 600 }}>UndoIcon</span>
  </div>
);
