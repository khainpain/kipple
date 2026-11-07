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
import { changelog } from "./changelog.mjs";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const OUT = here("../dist/");
const REPO = "https://github.com/khainpain/kipple";
const LINKS = { repo: REPO, releases: `${REPO}/releases`, issues: `${REPO}/issues` };
// Canonical address: SITE_URL if set, else the Vercel production domain, else the default one.
const SITE = (
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://telegram-saved-messages.vercel.app")
).replace(/\/$/, "");

async function latestRelease() {
  const fallback = { ver: "0.1.16", bytes: 7_523_840 };
  try {
    const r = await fetch("https://api.github.com/repos/khainpain/kipple/releases/latest", {
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
/** Escapes, then turns **x** into <b>x</b> and [text](https://…) into a link. */
const rich = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
const plain = (s) => String(s).replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

// Kipple is drawn inline (not an <img>) so its eyes can blink and it can bob, flip and sulk like
// the app's welcome screen (src/components/Welcome.tsx). Body from the brand file, with its two
// theme colours turned into CSS variables; the face is drawn on top, calm and angry.
const KIPPLE_BODY = (await readFile(here("./public/img/kipple-mascot-light.svg"), "utf8"))
  .replace(/^<svg[^>]*>|<\/svg>\s*$/g, "")
  .replace(/<path d="M(32\.5|56\.5|46) [^"]*"[^>]*\/>/g, "")
  .replace(/fill="#D9573B"/g, 'style="fill:var(--accent)"')
  .replace(/fill="#F2A58F"/g, 'style="fill:var(--kp-hat)"')
  .trim();
const KIPPLE_FACE = `<g class="kp-calm" fill="none" stroke="#23211E" stroke-linecap="round"><path class="kp-eye" d="M32.5 46 Q38 38.5 43.5 46" stroke-width="4.6"/><path class="kp-eye" d="M56.5 46 Q62 38.5 67.5 46" stroke-width="4.6"/><path d="M46 53 Q50 56.5 54 53" stroke-width="3.2"/></g><g class="kp-mad" fill="none" stroke="#23211E" stroke-linecap="round"><path d="M31 37.5 L43.5 42.5" stroke-width="4"/><path d="M69 37.5 L56.5 42.5" stroke-width="4"/><circle cx="38.5" cy="47.5" r="2.8" fill="#23211E" stroke="none"/><circle cx="61.5" cy="47.5" r="2.8" fill="#23211E" stroke="none"/><path d="M45 56.5 Q50 52 55 56.5" stroke-width="3.2"/><path d="M74 20 l4 -4 M80 24 l5 -2 M77 29 l5 1" stroke-width="2.4"/></g>`;
const mascot = (cls, size) =>
  `<div class="${cls} kp" aria-hidden="true"><div class="kp-bob"><div class="kp-body"><svg viewBox="0 0 100 100" width="${size}" height="${size}">${KIPPLE_BODY}${KIPPLE_FACE}</svg></div></div></div>`;
const ICON = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>',
  mic: '<svg viewBox="0 0 24 24" aria-hidden="true" class="line"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  doc: '<svg viewBox="0 0 24 24" aria-hidden="true" class="line"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true" class="line"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  globe: '<svg viewBox="0 0 24 24" aria-hidden="true" class="line"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true" class="line"><path d="M6 6l12 12M18 6 6 18"/></svg>',
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
      ${mascot("kip", 160)}
    </div>`;
}

/** "What's new": a pill in the corner that opens into a small card. A <details>, so it works without script. */
function news(c, rel) {
  const date = (d) => new Date(d + "T12:00:00Z").toLocaleDateString(c.lang === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "long" });
  // The newest released entry is highlighted, whether or not a "next" entry sits above it.
  const latest = changelog.find((e) => e.ver !== "next");
  const entries = changelog
    .map((e, n) => {
      const head = e.ver === "next" ? `<b>${esc(c.news.next)}</b>` : `<b>v${esc(e.ver)}</b><time datetime="${e.date}">${esc(date(e.date))}</time>`;
      return `<li class="rel${e.ver === "next" ? " soon" : e === latest ? " latest" : ""}" style="--n:${n}"><div class="rel-head">${head}</div><ul>${e[c.lang].map((x) => `<li>${esc(x)}</li>`).join("")}</ul></li>`;
    })
    .join("");
  return `<details class="news" data-ver="${esc(rel.ver)}">
  <summary><span class="dot" aria-hidden="true"></span>${esc(c.news.title)}<span class="ver">v${esc(rel.ver)}</span></summary>
  <div class="news-card" role="region" aria-label="${esc(c.news.title)}">
    <div class="news-top"><h2>${esc(c.news.title)}</h2><button type="button" class="news-x" aria-label="${esc(c.news.close)}">${ICON.x}</button></div>
    <ol class="rels">${entries}</ol>
    <a class="news-all" href="${LINKS.releases}">${esc(c.news.all)}</a>
  </div>
</details>`;
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
<script defer src="/_vercel/insights/script.js"></script>
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
<style>${css}</style>
</head>
<body>
<a class="skip" href="#main">${t(c.skip)}</a>
<header class="top wrap"><div class="brand">
  <a class="logo" href="${c.path}" aria-label="Kipple">
    <picture><source srcset="/img/kipple-logo-dark.svg" media="(prefers-color-scheme: dark)"><img src="/img/kipple-logo-light.svg" alt="Kipple" width="131" height="38"></picture>
  </a>
  <span class="alpha" title="${t(c.alpha)}" role="img" aria-label="${t(c.alpha)}">α</span></div>
  <details class="langs">
    <summary aria-label="${c.lang === "ru" ? "Язык" : "Language"}">${ICON.globe}<span>${c.lang.toUpperCase()}</span></summary>
    <ul>
      <li><a href="/" hreflang="en" lang="en"${c.lang === "en" ? ' aria-current="page"' : ""}>English</a></li>
      <li><a href="/ru/" hreflang="ru" lang="ru"${c.lang === "ru" ? ' aria-current="page"' : ""}>Русский</a></li>
    </ul>
  </details>
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
    <p>${r(c.closing.text)}</p>
    ${actions("closing")}
  </section>
</main>

<footer class="wrap foot">
  <nav>
${footLinks(c)}
  </nav>
  <p>${t(c.footer.note)}</p>
</footer>
${news(c, rel)}
<script>${js}</script>
</body>
</html>
`;
}

function footLinks(c) {
  return c.footer.links.map(([n, l]) => `    <a href="${l === "privacy" ? c.path + "privacy/" : LINKS[l]}">${esc(n)}</a>`).join("\n");
}

/** /privacy/ and /ru/privacy/: what leaves the computer, in plain words. */
function privacyPage(c, css) {
  const p = c.privacyPage;
  const url = SITE + c.path + "privacy/";
  return `<!doctype html>
<html lang="${c.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)} · Kipple</title>
<meta name="description" content="${esc(p.lead)}">
<link rel="canonical" href="${url}">
<meta name="color-scheme" content="light dark">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<script defer src="/_vercel/insights/script.js"></script>
<style>${css}
.legal { max-width: 720px; padding-block: 24px 56px; }
.legal h1 { font-size: clamp(30px, 4vw, 44px); margin-bottom: 12px; }
.legal .lead { color: var(--muted); font-size: 18px; margin-bottom: 32px; }
.legal h2 { font-size: 20px; margin: 28px 0 8px; }
.legal p { line-height: 1.6; }</style>
</head>
<body>
<header class="top wrap"><div class="brand">
  <a class="logo" href="${c.path}" aria-label="Kipple">
    <picture><source srcset="/img/kipple-logo-dark.svg" media="(prefers-color-scheme: dark)"><img src="/img/kipple-logo-light.svg" alt="Kipple" width="131" height="38"></picture>
  </a></div>
</header>
<main id="main" class="wrap legal">
  <h1>${esc(p.title)}</h1>
  <p class="lead">${esc(p.lead)}</p>
${p.sections.map(([h, b]) => `  <h2>${esc(h)}</h2>\n  <p>${esc(b)}</p>`).join("\n")}
</main>
<footer class="wrap foot">
  <nav>
${footLinks(c)}
  </nav>
  <p>${esc(c.footer.note)}</p>
</footer>
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
await mkdir(OUT + "privacy", { recursive: true });
await mkdir(OUT + "ru/privacy", { recursive: true });
await writeFile(OUT + "privacy/index.html", privacyPage(en, css));
await writeFile(OUT + "ru/privacy/index.html", privacyPage(ru, css));
// The stats dashboard (/stats/): a static page that reads /api/stats with a token.
await mkdir(OUT + "stats", { recursive: true });
await cp(here("./stats.html"), OUT + "stats/index.html");
await cp(here("./stats.js"), OUT + "stats/stats.js");
await writeFile(OUT + "robots.txt", `User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /stats/\nSitemap: ${SITE}/sitemap.xml\n`);
const alt = `<xhtml:link rel="alternate" hreflang="en" href="${SITE}/"/><xhtml:link rel="alternate" hreflang="ru" href="${SITE}/ru/"/>`;
await writeFile(
  OUT + "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    `<url><loc>${SITE}/</loc>${alt}</url>\n<url><loc>${SITE}/ru/</loc>${alt}</url>\n` +
    `<url><loc>${SITE}/privacy/</loc></url>\n<url><loc>${SITE}/ru/privacy/</loc></url>\n</urlset>\n`,
);
console.log(`landing: ${SITE} (v${rel.ver}, ${rel.size.en})`);
