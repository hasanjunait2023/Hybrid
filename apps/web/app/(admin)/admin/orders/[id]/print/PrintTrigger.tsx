"use client";

// Wires the on-screen "প্রিন্ট করুন" button to window.print(). Kept as a tiny
// client island so the print page stays a Server Component. Print CSS (hide
// nav/chrome, black-on-white) is injected here scoped to the print document.
import { useEffect } from "react";

export function PrintTrigger() {
  useEffect(() => {
    const btn = document.querySelector<HTMLButtonElement>("[data-print-button]");
    const handler = () => window.print();
    btn?.addEventListener("click", handler);
    return () => btn?.removeEventListener("click", handler);
  }, []);

  return (
    <style>{`
      @media print {
        /* Hide the admin shell chrome (nav, header) and screen-only controls. */
        header, nav, aside, .no-print { display: none !important; }
        body, .print-doc { background: #fff !important; color: #000 !important; }
        main { padding: 0 !important; max-width: none !important; }
        @page { margin: 12mm; }
      }
    `}</style>
  );
}
