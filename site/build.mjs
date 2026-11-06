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

const mascot = (cls, size, eager) =>
  `<picture class="${cls}"><source srcset="/img/kipple-mascot-dark.svg" media="(prefers-color-scheme: dark)"><img src="/img/kipple-mascot-light.svg" alt="" width="${size}" height="${size}"${eager ? "" : ' loading="lazy"'}></picture>`;
const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true" class="line"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  doc: '<svg viewBox="0 0 24 24" aria-hidden="true" class="line"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true" class="line"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  dl: '<svg viewBox="0 0 24 24" aria-hidden="true" class="line"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19h14"/></svg>',
};

/** The hero picture: a tidy board (what you see without script or with reduced motion);
 *  the script throws it into a pile first, lets Kipple eat the junk and tidy the rest. */
function stage(c) {
  const P = c.pile;
  const [code, food, travel, ideas] = P.topics;
  const chip = (name, hue) => `<span class="chip" style="--h:${hue}">${esc(name)}</span>`;
  // x, y: where the card lands in the pile (% of the stage), r: its tilt.
  const card = (pile, body) => `<div class="card" data-pile="${pile}">${body}</div>`;
  return `<div class="stage" aria-hidden="true">
      <div class="board">
        <div class="col">
          ${card("14 40 -14", `<div class="cover art a1" style="--h:210">${ICON.link}</div><b>${esc(P.link1)}</b>${chip(code, 210)}`)}
          ${card("8 71 -22", `<div class="file">${ICON.doc}<span>${esc(P.pdf)}</span></div>`)}
          ${card("30 56 10", `<div class="cover art a4 short" style="--h:330"></div>`)}
        </div>
        <div class="col">
          ${card("40 36 9", `<div class="cover art a2 tall" style="--h:14"><span class="play">${ICON.play}</span></div><b>${esc(P.video)}</b>${chip(food, 14)}`)}
          ${card("22 78 6", `<div class="cover art a5 short" style="--h:45"></div><b>${esc(P.link3)}</b>${chip(ideas, 270)}`)}
        </div>
        <div class="col">
          ${card("78 58 -6", `<p class="idea">${esc(P.note2)}</p>${chip(ideas, 270)}`)}
          ${card("56 65 18", `<div class="cover art a3" style="--h:165"><span class="more">+4</span></div><b>${esc(P.link2)}</b>${chip(travel, 165)}`)}
        </div>
        <div class="col">
          ${card("90 38 12", `<div class="cover art a6 tall" style="--h:280"></div>`)}
          ${card("70 80 -10", `<p class="idea mono">${esc(P.note1)}</p>${chip(code, 210)}`)}
        </div>
      </div>
      <div class="junk" data-pile="44 48 24"><div class="cover art a5 short" style="--h:45"></div><b>${esc(P.link3)}</b></div>
      <div class="junk voice" data-pile="86 41 -16">${ICON.mic}<span class="wave"></span><span>${esc(P.voice)}</span></div>
      <div class="junk note" data-pile="52 76 -8">asdf</div>
      ${mascot("kip", 160, true)}
    </div>`;
}

function page(c, other, rel, css, js) {
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
  const actions = (id) => `
      <div class="actions">
        <a class="btn primary" href="/download" data-download="${id}">${ICON.dl}${t(c.hero.download)}</a>
        <a class="btn" href="${demo}">${t(c.hero.demo)}</a>
      </div>
      <p class="meta">${c.hero.meta.map((m) => `<span>${t(m)}</span>`).join("")}</p>
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
<script>if(!matchMedia("(prefers-reduced-motion: reduce)").matches)document.documentElement.classList.add("motion")</script>
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
<style>${css}</style>
</head>
<body>
<a class="skip" href="#main">${t(c.skip)}</a>
<header class="top wrap">
  <a class="logo" href="${c.path}" aria-label="Kipple">
    <picture><source srcset="/img/kipple-logo-dark.svg" media="(prefers-color-scheme: dark)"><img src="/img/kipple-logo-light.svg" alt="Kipple" width="131" height="38"></picture>
  </a>
  <nav><a href="${other.path}" hreflang="${other.lang}" lang="${other.lang}">${t(c.other)}</a></nav>
</header>

<main id="main">
  <section class="hero wrap">
    <div class="hero-text">
      <h1>${t(c.hero.title)}</h1>
      <p class="sub">${t(c.hero.sub)}</p>
      ${actions("hero")}
    </div>
    <div class="hero-art">
      ${stage(c)}
      <button class="replay" type="button" hidden>${t(c.hero.replay)}</button>
    </div>
  </section>

  <section class="points wrap">
    <ul>
${c.points.map(([h, d], i) => `      <li class="reveal" style="--i:${i}"><h2>${t(h)}</h2><p>${t(d)}</p></li>`).join("\n")}
    </ul>
  </section>

  <section class="real wrap reveal">
    <a class="shot" href="${demo}">
      <picture>
        <source type="image/webp" media="(prefers-color-scheme: dark)" srcset="${shot("dark", 960)} 960w, ${shot("dark", 1600)} 1600w" sizes="(max-width: 1180px) 100vw, 1120px">
        <img src="${shot("light", 1600)}" srcset="${shot("light", 960)} 960w, ${shot("light", 1600)} 1600w" sizes="(max-width: 1180px) 100vw, 1120px" width="1600" height="975" alt="${t(c.shot.alt)}" loading="lazy">
      </picture>
      <span class="btn primary over">${ICON.play}${t(c.shot.cta)}</span>
    </a>
    <ul class="badges">
${c.privacy.map((s) => `      <li>${t(s)}</li>`).join("\n")}
    </ul>
  </section>

  <section class="faq wrap reveal" aria-labelledby="faq-h">
    <h2 id="faq-h">${t(c.faq.title)}</h2>
${c.faq.items.map(([q, a]) => `    <details><summary>${t(q)}</summary><p>${r(a)}</p></details>`).join("\n")}
  </section>

  <section class="closing wrap reveal" aria-labelledby="closing-h">
    ${mascot("bob", 112)}
    <h2 id="closing-h">${t(c.closing.title)}</h2>
    <p>${t(c.closing.text)}</p>
    ${actions("closing")}
  </section>
</main>

<footer class="wrap foot">
  <nav>
${c.footer.links.map(([n, l]) => `    <a href="${LINKS[l]}">${t(n)}</a>`).join("\n")}
  </nav>
  <p>${t(c.footer.note)}</p>
</footer>
<script>${js}</script>
</body>
</html>
`;
}

const rel = await latestRelease();
const mb = rel.bytes / 1_048_576;
rel.size = { en: `${mb.toFixed(1)} MB`, ru: `${mb.toFixed(1).replace(".", ",")} МБ` };
const css = (await readFile(here("./style.css"), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s*\n\s*/g, "\n").trim();
const js = (await readFile(here("./landing.js"), "utf8")).trim();

await mkdir(OUT + "ru", { recursive: true });
await cp(here("./public/"), OUT, { recursive: true });
await writeFile(OUT + "index.html", page(en, ru, rel, css, js));
await writeFile(OUT + "ru/index.html", page(ru, en, rel, css, js));
await writeFile(OUT + "robots.txt", `User-agent: *\nAllow: /\nDisallow: /app/\nSitemap: ${SITE}/sitemap.xml\n`);
const alt = `<xhtml:link rel="alternate" hreflang="en" href="${SITE}/"/><xhtml:link rel="alternate" hreflang="ru" href="${SITE}/ru/"/>`;
await writeFile(
  OUT + "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    `<url><loc>${SITE}/</loc>${alt}</url>\n<url><loc>${SITE}/ru/</loc>${alt}</url>\n</urlset>\n`,
);
console.log(`landing: ${SITE} (v${rel.ver}, ${rel.size.en})`);
