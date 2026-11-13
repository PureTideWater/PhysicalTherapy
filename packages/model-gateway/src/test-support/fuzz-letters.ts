/**
 * The letters of the base-against-head fuzz of Queues item 34 (the ops scripts' fuzz.mts), built from a seed alone:
 * names, member IDs and claim numbers of repeated letters and digits and of the records' separators, cut, cased and
 * spelled apart, between marks and line endings of every kind. SYNTHETIC by construction: no value of any person.
 */
export interface FuzzLetter {
  readonly names: readonly string[];
  readonly memberIds: readonly string[];
  readonly claimNumbers: readonly string[];
  readonly text: string;
}

const NAMES = [
  "AAAAAAAA",
  "ABABABAB",
  "ZEPHYRAZ",
  "JANE ZEPHYRA",
  "ANNA HANNAH",
  "AA'AAAAAA",
  "JANE+ZEPHYRA",
  "NANA NAN",
];
const NUMS = [
  "12121/2121",
  "12312312",
  "000&11",
  "11111111",
  "11111111/7",
  "7,7,7,7,7",
  "ZZ12345/01",
  "12 12 12",
  "76543210",
  "21318-5",
  "1001001",
  "ZZ12345 01",
];
const SEPS = [
  " ",
  " ",
  "\u0085",
  ".",
  "/",
  "&",
  "\r\n",
  "\n",
  "\n\r",
  ",",
  ";",
  "\t",
  "-",
  ":",
  "\r",
  "+",
  "(",
  "\u0004",
  " ",
  "",
];
const LABELS = [
  "Member ID ",
  "Claim No. ",
  "Ref ",
  "Dear ",
  "Fax X",
  "Patient: ",
  "",
];

/** The `count` letters of a seed, in order: the same letters on every machine and in every run. */
export function fuzzLetters(seed: number, count: number): FuzzLetter[] {
  let state = seed >>> 0;
  const rnd = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T>(from: readonly T[]): T =>
    from[Math.floor(rnd() * from.length)] as T;
  /** `of` times in `outOf`: rnd is a whole number over 2 to the 32nd, so the product is exact and this is rnd() under of/outOf. */
  const chance = (of: number, outOf: number) => rnd() * outOf < of;
  const cut = (value: string) => {
    const a = Math.floor(rnd() * value.length);
    const b = a + 1 + Math.floor(rnd() * (value.length - a));
    let piece = value.slice(a, b);
    if (chance(3, 10)) piece = piece.toLowerCase();
    if (chance(2, 10))
      piece = [...piece]
        .map((c) => (chance(1, 2) ? c.toLowerCase() : c))
        .join("");
    if (chance(1, 4)) piece = [...piece].join(pick(SEPS));
    return piece;
  };
  const letters: FuzzLetter[] = [];
  for (let i = 0; i < count; i += 1) {
    const names = [pick(NAMES)];
    const memberIds = [pick(NUMS)];
    const claimNumbers = [
      pick(NUMS),
      ...(chance(4, 10) ? [pick(NUMS)] : []),
    ].filter((x, j, all) => all.indexOf(x) === j);
    const values = [...names, ...memberIds, ...claimNumbers];
    let text = "";
    const pieces = 2 + Math.floor(rnd() * 9);
    for (let j = 0; j < pieces; j += 1) {
      text +=
        (chance(2, 10) ? pick(LABELS) : "") +
        (chance(35, 100) ? pick(values) : cut(pick(values))) +
        pick(SEPS);
    }
    letters.push({ names, memberIds, claimNumbers, text });
  }
  return letters;
}

/** A count that is the same only for the same letters in the same order (FNV-1a over every code unit): what a recorded verdict is checked against. */
export function sumOf(letters: readonly FuzzLetter[]): number {
  let hash = 0x811c9dc5;
  for (const letter of letters) {
    for (const part of [
      ...letter.names,
      ...letter.memberIds,
      ...letter.claimNumbers,
      letter.text,
    ]) {
      for (let i = 0; i < part.length; i += 1) {
        hash = Math.imul(hash ^ part.charCodeAt(i), 0x01000193) >>> 0;
      }
      hash = Math.imul(hash ^ 0xffff, 0x01000193) >>> 0;
    }
  }
  return hash;
}
