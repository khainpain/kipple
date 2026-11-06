// Runs before the app's CSS paints so the first frame already has the right theme.
// Kept in sync with src/lib/theme.ts (same storage key and values).
(function () {
  var pref = "system";
  try {
    pref = localStorage.getItem("kipple.theme") || "system";
  } catch (e) {}
  var dark = pref === "dark" || (pref !== "light" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();
