import * as React from "react";
import { XCircleIcon } from "@hybrid/ui";

// Authored preview for the otherwise-invisible 20px stroke icon: render it at
// display sizes in the brand indigo so the card shows a real glyph, not a blank.
export const Sizes = () => (
  <div style={{ display: "flex", alignItems: "center", gap: 24, padding: 32, background: "#fff", color: "#1d4ed8" }}>
    <XCircleIcon width={48} height={48} />
    <XCircleIcon width={32} height={32} />
    <XCircleIcon width={24} height={24} />
    <span style={{ marginLeft: 8, color: "#1c1917", fontFamily: "system-ui, sans-serif", fontSize: 13, fontWeight: 600 }}>XCircleIcon</span>
  </div>
);
