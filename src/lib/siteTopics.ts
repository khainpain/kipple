import { T } from "../i18n/index.js";
import { hostChain } from "./siteMarks";

/**
 * Sites whose links nearly always belong to one subject, so a card gets a topic with no AI.
 * Platforms where anything goes (YouTube, Instagram, Telegram, X…) are left out on purpose.
 */
const SITE_TOPICS = {
  dev: ["github.com", "gitlab.com", "bitbucket.org", "stackoverflow.com", "stackexchange.com", "superuser.com", "serverfault.com", "habr.com", "dev.to", "npmjs.com", "pypi.org", "crates.io", "hub.docker.com", "developer.mozilla.org", "docs.python.org", "rust-lang.org", "codepen.io", "codesandbox.io", "replit.com", "leetcode.com", "huggingface.co", "kaggle.com"],
  design: ["dribbble.com", "behance.net", "figma.com", "awwwards.com", "mobbin.com", "coolors.co", "fonts.google.com", "unsplash.com", "pinterest.com", "pin.it"],
  science: ["arxiv.org", "biorxiv.org", "nature.com", "science.org", "sciencedirect.com", "pubmed.ncbi.nlm.nih.gov", "researchgate.net", "scholar.google.com", "cyberleninka.ru", "elibrary.ru"],
  movies: ["imdb.com", "kinopoisk.ru", "letterboxd.com", "boxd.it", "netflix.com", "rottentomatoes.com", "themoviedb.org"],
  books: ["goodreads.com", "livelib.ru", "litres.ru", "openlibrary.org", "gutenberg.org", "bookmate.com"],
  music: ["spotify.com", "spotify.link", "soundcloud.com", "music.apple.com", "bandcamp.com", "music.yandex.ru", "genius.com", "last.fm", "deezer.com"],
  shopping: ["amazon.com", "amazon.de", "amazon.nl", "amazon.co.uk", "amazon.fr", "amazon.es", "amazon.it", "aliexpress.com", "aliexpress.ru", "ebay.com", "etsy.com", "bol.com", "ozon.ru", "wildberries.ru", "avito.ru", "market.yandex.ru", "ikea.com"],
  travel: ["maps.google.com", "maps.app.goo.gl", "2gis.ru", "booking.com", "airbnb.com", "tripadvisor.com", "skyscanner.net"],
  recipes: ["allrecipes.com", "seriouseats.com", "bonappetit.com", "eda.ru", "povarenok.ru", "food.ru"],
  learning: ["coursera.org", "udemy.com", "edx.org", "khanacademy.org", "stepik.org", "duolingo.com"],
} satisfies Record<string, string[]>;

export type SiteTopic = keyof typeof SITE_TOPICS;

const BY_DOMAIN = new Map<string, SiteTopic>(Object.entries(SITE_TOPICS).flatMap(([k, ds]) => ds.map((d) => [d, k as SiteTopic] as const)));

/** The built-in topic for a link's site, in the interface language; subdomains count (ru.m.imdb.com). */
export function builtinTopicOf(url: string | undefined): string | undefined {
  const key = hostChain(url).map((h) => BY_DOMAIN.get(h)).find(Boolean);
  return key ? T.siteTopics[key] : undefined;
}
