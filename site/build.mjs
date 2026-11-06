// Builds the landing page into dist/ next to the browser build (dist/app/), as plain HTML and
// CSS with a few lines of script: English at /, Russian at /ru/, plus robots.txt and sitemap.xml.
// Runs after `vite build --mode web` (see package.json "build:web"). No dependencies.
//
// The version and installer size come from the latest GitHub release when the API answers;
// otherwise the fallbacks below are used (the download link itself always goes through
// /download, which looks up the newest installer when clicked).
import { readFile, writeFile, mkdir, cp } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { en, ru } from "./copy.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const OUT = here("../dist/");
const REPO = "https://github.com/khainpain/telegram-saved-messages";
const LINKS = { repo: REPO, releases: `${REPO}/releases`, issues: `${REPO}/issues` };
// Canonical address: SITE_URL if set, else the Vercel production domain, else the default one.
const SITE = (
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://telegram-saved-messages.vercel.app")
).replace(/\/$/, "");

async function latestRelease() {
  const fallback = { ver: "0.1.15", bytes: 7_523_840 };
  try {
    const r = await fetch("https://api.github.com/repos/khainpain/telegram-saved-messages/releases/latest", {
      headers: { accept: "application/vnd.github+json", "user-agent": "kipple-landing-build" },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return fallback;
    const d = await r.json();
    const exe = d.assets?.find((a) => /^Install-Kipple-[\d.]+\.exe$/i.test(a.name)) ?? d.assets?.find((a) => /_x64-setup\.exe$/i.test(a.name));
    return { ver: String(d.tag_name ?? "").replace(/^v/, "") || fallback.ver, bytes: exe?.size ?? fallback.bytes };
  } catch {
    return fallback;
  }
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Escapes, then turns **x** into <b>x</b>. */
const rich = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
const plain = (s) => String(s).replace(/\*\*(.+?)\*\*/g, "$1");

function page(c, other, rel, css) {
  const fill = (s) => s.replaceAll("{ver}", rel.ver).replaceAll("{size}", rel.size[c.lang]);
  const t = (s) => esc(fill(s));
  const r = (s) => rich(fill(s));
  const demo = `/app/?demo&amp;lang=${c.lang}`;
  const url = SITE + c.path;
  const shot = (theme, w) => `/img/board-${theme}-${c.lang}-${w}.webp`;
  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "Kipple",
      description: c.description,
      applicationCategory: "ProductivityApplication",
      operatingSystem: "Windows 10, Windows 11",
      softwareVersion: rel.ver,
      fileSize: rel.size.en,
      downloadUrl: `${SITE}/download`,
      url,
      image: `${SITE}/img/og-${c.lang}.png`,
      screenshot: SITE + shot("light", 1600),
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      inLanguage: ["en", "ru"],
      codeRepository: REPO,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: c.faq.items.map(([q, a]) => ({ "@type": "Question", name: fill(q), acceptedAnswer: { "@type": "Answer", text: plain(fill(a)) } })),
    },
  ];
  const meta = c.hero.meta.map((m) => `<span>${t(m)}</span>`).join("");
  const downloadBlock = (id) => `
      <div class="actions">
        <a class="btn primary" href="/download" data-download="${id}">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14"/></svg>
          ${t(c.hero.download)}
        </a>
        <a class="btn" href="${demo}">${t(id === "hero" ? c.hero.demo : c.closing.demo)}</a>
      </div>
      <p class="meta">${meta}<span>${t(c.hero.demoMeta)}</span></p>
      <p class="note" data-started="${id}" role="status" hidden>${r(c.started)}</p>
      <p class="note" data-notwin="${id}" hidden>${t(c.notWindows)}</p>`;

  return `<!doctype html>
<html lang="${c.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t(c.title)}</title>
<meta name="description" content="${t(c.description)}">
<link rel="canonical" href="${url}">
<link rel="alternate" hreflang="${c.lang}" href="${url}">
<link rel="alternate" hreflang="${other.lang}" href="${SITE + other.path}">
<link rel="alternate" hreflang="x-default" href="${SITE}/">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f5f3ef">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#171614">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Kipple">
<meta property="og:url" content="${url}">
<meta property="og:locale" content="${c.locale}">
<meta property="og:locale:alternate" content="${other.locale}">
<meta property="og:title" content="${t(c.ogTitle)}">
<meta property="og:description" content="${t(c.ogDescription)}">
<meta property="og:image" content="${SITE}/img/og-${c.lang}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${t(c.ogAlt)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" as="image" type="image/webp" imagesrcset="${shot("light", 960)} 960w, ${shot("light", 1600)} 1600w" imagesizes="(max-width: 1180px) 100vw, 1120px" media="(prefers-color-scheme: light)" fetchpriority="high">
<link rel="preload" as="image" type="image/webp" imagesrcset="${shot("dark", 960)} 960w, ${shot("dark", 1600)} 1600w" imagesizes="(max-width: 1180px) 100vw, 1120px" media="(prefers-color-scheme: dark)" fetchpriority="high">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
<style>${css}</style>
</head>
<body>
<a class="skip" href="#main">${c.lang === "ru" ? "К содержанию" : "Skip to content"}</a>
<header class="top wrap">
  <a class="logo" href="${c.path}" aria-label="Kipple">
    <picture><source srcset="/img/kipple-logo-dark.svg" media="(prefers-color-scheme: dark)"><img src="/img/kipple-logo-light.svg" alt="Kipple" width="131" height="38"></picture>
  </a>
  <nav aria-label="${c.lang === "ru" ? "Разделы" : "Sections"}">
    <a href="#features">${t(c.nav.features)}</a>
    <a href="#privacy">${t(c.nav.privacy)}</a>
    <a href="#faq">${t(c.nav.faq)}</a>
    <a href="${other.path}" hreflang="${other.lang}" lang="${other.lang}" class="lang">${t(c.nav.other)}</a>
  </nav>
</header>

<main id="main">
  <section class="hero wrap">
    <div class="hero-text">
      <h1>${t(c.hero.title)}</h1>
      <p class="sub">${t(c.hero.sub)}</p>
      ${downloadBlock("hero")}
    </div>
    <figure class="shot">
      <a href="${demo}" tabindex="-1" aria-hidden="true">
        <picture>
          <source type="image/webp" media="(prefers-color-scheme: dark)" srcset="${shot("dark", 960)} 960w, ${shot("dark", 1600)} 1600w" sizes="(max-width: 1180px) 100vw, 1120px">
          <img src="${shot("light", 1600)}" srcset="${shot("light", 960)} 960w, ${shot("light", 1600)} 1600w" sizes="(max-width: 1180px) 100vw, 1120px" width="1600" height="975" alt="${t(c.hero.shotAlt)}" fetchpriority="high">
        </picture>
      </a>
      <figcaption>${t(c.hero.caption)}</figcaption>
    </figure>
  </section>

  <section class="pains wrap" aria-labelledby="pains-h">
    <h2 id="pains-h">${t(c.pains.title)}</h2>
    <ol class="pain-list">
${c.pains.items.map(([p, f]) => `      <li><p class="pain">${t(p)}</p><p>${t(f)}</p></li>`).join("\n")}
    </ol>
  </section>

  <section class="features wrap" id="features" aria-labelledby="features-h">
    <h2 id="features-h">${t(c.features.title)}</h2>
    <ul class="grid3">
${c.features.items.map(([n, d]) => `      <li><h3>${t(n)}</h3><p>${t(d)}</p></li>`).join("\n")}
    </ul>
  </section>

  <section class="how wrap" aria-labelledby="how-h">
    <h2 id="how-h">${t(c.how.title)}</h2>
    <ol class="steps">
${c.how.items.map(([n, d]) => `      <li><h3>${t(n)}</h3><p>${t(d)}</p></li>`).join("\n")}
    </ol>
  </section>

  <section class="privacy" id="privacy" aria-labelledby="privacy-h">
    <div class="wrap split">
      <div>
        <h2 id="privacy-h">${t(c.privacy.title)}</h2>
        <p class="lead">${t(c.privacy.lead)}</p>
        <p>${t(c.privacy.proof)} <a href="${REPO}">${t(c.privacy.proofLink)}</a></p>
      </div>
      <ul class="checks">
${c.privacy.items.map((s) => `        <li>${t(s)}</li>`).join("\n")}
      </ul>
    </div>
  </section>

  <section class="trust wrap" aria-labelledby="trust-h">
    <h2 id="trust-h">${t(c.trust.title)}</h2>
    <ul class="grid3">
${c.trust.items.map(([h, d, l]) => `      <li><h3><a href="${LINKS[l]}">${t(h)}</a></h3><p>${t(d)}</p></li>`).join("\n")}
    </ul>
  </section>

  <section class="faq wrap" id="faq" aria-labelledby="faq-h">
    <h2 id="faq-h">${t(c.faq.title)}</h2>
${c.faq.items.map(([q, a], i) => `    <details${i === 0 ? " open" : ""}><summary>${t(q)}</summary><p>${r(a)}</p></details>`).join("\n")}
  </section>

  <section class="closing wrap" aria-labelledby="closing-h">
    <picture><source srcset="/img/kipple-mascot-dark.svg" media="(prefers-color-scheme: dark)"><img src="/img/kipple-mascot-light.svg" alt="" width="88" height="88" loading="lazy"></picture>
    <h2 id="closing-h">${t(c.closing.title)}</h2>
    <p>${t(c.closing.text)}</p>
    ${downloadBlock("closing")}
  </section>
</main>

<footer class="wrap foot">
  <p>Kipple. ${t(c.slogan)}.</p>
  <nav aria-label="${c.lang === "ru" ? "Ссылки" : "Links"}">
${c.footer.links.map(([n, l]) => `    <a href="${LINKS[l]}">${t(n)}</a>`).join("\n")}
    <a href="${other.path}" hreflang="${other.lang}" lang="${other.lang}">${t(c.nav.other)}</a>
  </nav>
  <p class="small">${t(c.footer.note)}</p>
</footer>
<script>
(function () {
  var win = /Windows/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.userAgent);
  document.querySelectorAll("[data-download]").forEach(function (a) {
    var id = a.getAttribute("data-download");
    if (!win) document.querySelector('[data-notwin="' + id + '"]').hidden = false;
    a.addEventListener("click", function () {
      document.querySelector('[data-started="' + id + '"]').hidden = false;
    });
  });
})();
</script>
</body>
</html>
`;
}

const rel = await latestRelease();
const mb = rel.bytes / 1_048_576;
rel.size = { en: `${mb.toFixed(1)} MB`, ru: `${mb.toFixed(1).replace(".", ",")} МБ` };
const css = (await readFile(here("./style.css"), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s*\n\s*/g, "\n").trim();

await mkdir(OUT + "ru", { recursive: true });
await cp(here("./public/"), OUT, { recursive: true });
await writeFile(OUT + "index.html", page(en, ru, rel, css));
await writeFile(OUT + "ru/index.html", page(ru, en, rel, css));
await writeFile(OUT + "robots.txt", `User-agent: *\nAllow: /\nDisallow: /app/\nSitemap: ${SITE}/sitemap.xml\n`);
const alt = `<xhtml:link rel="alternate" hreflang="en" href="${SITE}/"/><xhtml:link rel="alternate" hreflang="ru" href="${SITE}/ru/"/>`;
await writeFile(
  OUT + "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    `<url><loc>${SITE}/</loc>${alt}</url>\n<url><loc>${SITE}/ru/</loc>${alt}</url>\n</urlset>\n`,
);
console.log(`landing: ${SITE} (v${rel.ver}, ${rel.size.en})`);
