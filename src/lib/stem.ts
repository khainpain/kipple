import { stemmer } from "stemmer";

// Russian Snowball stemmer (snowballstem.org/algorithms/russian), regex form.
// ([ая]) is the algorithm's "preceded by а or я": it is captured and put back with "$1",
// because lookbehind would break the web build on Safari before 16.4.
const PERFECTIVE_GERUND = /(?:ив|ивши|ившись|ыв|ывши|ывшись|([ая])(?:в|вши|вшись))$/;
const REFLEXIVE = /(ся|сь)$/;
const ADJECTIVE = /(ее|ие|ые|ое|ими|ыми|ей|ий|ый|ой|ем|им|ым|ом|его|ого|ему|ому|их|ых|ую|юю|ая|яя|ою|ею)$/;
const PARTICIPLE = /(?:ивш|ывш|ующ|([ая])(?:ем|нн|вш|ющ|щ))$/;
const VERB = /(?:ила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ило|ыло|ено|ят|ует|уют|ит|ыт|ены|ить|ыть|ишь|ую|ю|([ая])(?:ла|на|ете|йте|ли|й|л|ем|н|ло|но|ет|ют|ны|ть|ешь|нно))$/;
const NOUN = /(а|ев|ов|ие|ье|е|иями|ями|ами|еи|ии|и|ией|ей|ой|ий|й|иям|ям|ием|ем|ам|ом|о|у|ах|иях|ях|ы|ь|ию|ью|ю|ия|ья|я)$/;
const RV = /^(.*?[аеиоуыэюя])(.*)$/;
const VOWEL = /[аеиоуыэюя]/;

/** Snowball's R1/R2: the part after the first consonant that follows a vowel, from `from` on. */
function region(word: string, from: number): number {
  for (let i = from + 1; i < word.length; i++) if (VOWEL.test(word[i - 1]) && !VOWEL.test(word[i])) return i + 1;
  return word.length;
}

function stemRu(word: string): string {
  const m = RV.exec(word);
  if (!m) return word;
  let rv = m[2];
  const gerund = rv.replace(PERFECTIVE_GERUND, "$1");
  if (gerund !== rv) rv = gerund;
  else {
    rv = rv.replace(REFLEXIVE, "");
    const adj = rv.replace(ADJECTIVE, "");
    if (adj !== rv) rv = adj.replace(PARTICIPLE, "$1");
    else {
      const verb = rv.replace(VERB, "$1");
      rv = verb !== rv ? verb : rv.replace(NOUN, "");
    }
  }
  rv = rv.replace(/и$/, "");
  const derivational = /ость?$/.exec(rv);
  if (derivational && m[1].length + derivational.index >= region(word, region(word, 0))) rv = rv.slice(0, derivational.index);
  const soft = rv.replace(/ь$/, "");
  rv = soft !== rv ? soft : rv.replace(/ейше?$/, "").replace(/нн$/, "н");
  return m[1] + rv;
}

/**
 * A word as search compares it: lowercase, ё as е (Russian writes them interchangeably),
 * composed letters and no stress marks ("рабо́та" is "работа").
 */
export function fold(term: string): string {
  return term.replace(/\u0301/g, "").normalize("NFC").toLowerCase().replace(/ё/g, "е");
}

/**
 * The common stem of a Russian or English word, so "кошки" and "кошкой" meet at "кошк".
 * Other words (numbers, mixed scripts, other languages) come back lowercased.
 * A stem shorter than three letters is too broad for prefix search, so such words stay whole.
 */
export function stem(term: string): string {
  const word = fold(term);
  const out = /^[а-я]+$/.test(word) ? stemRu(word) : /^[a-z]+$/.test(word) ? stemmer(word) : word;
  return out.length >= 3 ? out : word;
}
