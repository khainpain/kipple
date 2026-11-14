import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./lib/theme";

// Page views of the browser demo on the site (/app/): Vercel Web Analytics, no cookies.
// Never in the desktop app, which only sends its own anonymous daily ping (lib/telemetry.ts).
if (import.meta.env.MODE === "web") void import("@vercel/analytics").then((m) => m.inject());

// Cards are dragged onto topics with the web's own drag and drop (Tauri's file drop is off for
// that). A file or link dropped anywhere that doesn't take it must not make the window navigate
// to it: on every screen, the start screen included.
const stray = (e: DragEvent) => {
  const t = e.dataTransfer?.types ?? [];
  if (!e.defaultPrevented && (t.includes("Files") || t.includes("text/uri-list"))) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "none";
  }
};
window.addEventListener("dragover", stray);
window.addEventListener("drop", stray);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
