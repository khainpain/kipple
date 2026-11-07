import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./lib/theme";

// Page views of the browser demo on the site (/app/): Vercel Web Analytics, no cookies.
// Never in the desktop app, which only sends its own anonymous daily ping (lib/telemetry.ts).
if (import.meta.env.MODE === "web") void import("@vercel/analytics").then((m) => m.inject());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
