import { afterAll, describe, expect, it } from "vitest";
import { setLang, type Lang } from "../i18n";
import { ru } from "../i18n/ru";
import { en } from "../i18n/en";
import { demoLibrary } from "./demo";
import { breakdown } from "./cleanup";
import { effectiveTopic, matchesFilter } from "./library";
import { linkCounts } from "./linkcheck";
import { countDuplicateGroups, findDuplicates } from "./smart";
import type { CardKind } from "./types";

afterAll(() => setLang("ru"));

/** The demo is what people (and every recording) see of Kipple, so it has to keep showing each thing. */
describe.each<Lang>(["en", "ru"])("the demo archive (%s)", (l) => {
  setLang(l);
  const lib = demoLibrary();
  const live = lib.cards.filter((c) => matchesFilter(c, "all"));
  const b = breakdown(lib.cards);
  const pile = (kind: string) => b.piles.filter((p) => p.kind === kind);

  it("has every kind of message Kipple reads", () => {
    const kinds = new Set(lib.cards.map((c) => c.kind));
    for (const k of ["link", "photo", "video", "animation", "document", "voice", "video_note", "audio", "sticker", "text", "poll", "location", "contact"] satisfies CardKind[]) expect(kinds, k).toContain(k);
    expect(lib.cards.some((c) => c.album?.length)).toBe(true);
  });

  it("gives each card its own id, newest first", () => {
    expect(new Set(lib.cards.map((c) => c.id)).size).toBe(lib.cards.length);
    expect(lib.cards.every((c, i) => i === 0 || lib.cards[i - 1].date >= c.date)).toBe(true);
  });

  it("is half sorted already: topics from sites and topics picked by hand", () => {
    const topics = new Set(live.map(effectiveTopic).filter(Boolean));
    expect(topics.size).toBeGreaterThanOrEqual(6);
    expect(topics.size).toBeLessThanOrEqual(8);
    expect(live.some((c) => !c.user?.topic && effectiveTopic(c))).toBe(true);
    expect(b.sorted.topics).toBeGreaterThanOrEqual(25);
  });

  it("leaves a pile of every kind for the cleanup screen", () => {
    for (const k of ["junk", "dupes", "photos", "videos", "files", "audio", "old", "notes"]) expect(pile(k).length, k).toBe(1);
    expect(pile("channel").length).toBe(2);
    expect(pile("site").map((p) => p.name)).toEqual(["youtube.com"]);
    // The notes about money look like the topic the person sorted three cards into.
    expect(pile("like").length).toBe(1);
    expect(pile("like")[0].cards.length).toBe(3);
  });

  it("keeps passwords apart and finds the copies and the dead links", () => {
    expect(b.sensitive).toBe(3);
    expect(countDuplicateGroups(live, findDuplicates(live))).toBe(2);
    const links = linkCounts(lib.cards);
    expect(links.broken.length).toBe(2);
    expect(links.checked).toBe(links.links);
  });

  it("draws every picture itself: nothing is loaded from the network", () => {
    const srcs = lib.cards.flatMap((c) => [c.media?.path, c.media?.thumb, c.link?.image, ...(c.album ?? []).map((m) => m.path)]).filter(Boolean);
    expect(srcs.length).toBeGreaterThan(40);
    expect(srcs.every((s) => s!.startsWith("data:"))).toBe(true);
  });
});

it("tells the same story in both languages", () => {
  const shape = (d: typeof ru.demo) => d.cards.map((s) => [s.k ?? (s.url ? "link" : "text"), s.d, s.from ? "ch" : "", s.topic ? "t" : "", !!s.pin, s.pic ?? "", s.album ?? 0].join());
  expect(shape(en.demo)).toEqual(shape(ru.demo));
});
