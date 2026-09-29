/**
 * The four chapters' words. Every historical claim was checked on 2026-09-28
 * against the sources listed with it, and the page renders those sources under
 * "Learn more" and again in the footer — history on a KOC page must be citable.
 *
 * Deliberately NOT claimed, because no reputable source settles it:
 *   - the exact day Burgan No. 1 struck oil (22 or 23 February; early March
 *     and April also appear) — the page says "February 1938";
 *   - any derrick height at Bahra or Burgan — the models use period-standard
 *     proportions, and the page never labels a height;
 *   - modern mast heights — the rig pad is illustrative.
 * Corrected on checking: the 1946 cargo loaded offshore via submarine lines
 * (no pier yet), the Sheikh turned a silver WHEEL, and 10,567 tons is the
 * cargo while "12,000 tons" was the ship's size.
 */

export interface Source {
  label: string;
  href: string;
}

export interface Chapter {
  numeral: "I" | "II" | "III" | "IV";
  /** Short label for the chapter index. */
  index: string;
  year: string;
  title: string;
  body: string;
  /** Body for the no-WebGL still, where there is no pad to press. */
  bodyStill?: string;
  more: string;
  sources: Source[];
}

const KUNA_1934: Source = {
  label: "KUNA (2014) — KOC's founding and the 1934 concession",
  href: "https://www.kuna.net.kw/ArticleDetails.aspx?id=2415466&language=en",
};
const BP_ARCHIVE: Source = {
  label: "BP Archive — Kuwait Oil Company records (archived copy)",
  href: "http://web.archive.org/web/20250111191052/https://archiveshub.jisc.ac.uk/search/archives/7b407c7d-23af-37de-9408-a67f0382dd57",
};
const WORLD_OIL_1952: Source = {
  label: "World Oil, January 1952 — Bahra and Burgan drilling history",
  href: "https://archive.org/details/sim_world-oil_1952-01_134_1",
};
const PETROLEUM_ENGINEER_1938: Source = {
  label: "The Petroleum Engineer, October 1938 — the rigs at Bahra and Burgan",
  href: "https://archive.org/details/sim_petroleum-engineer-international_1938-10_10_1/page/90/mode/1up",
};
const KUNA_BURGAN: Source = {
  label: "KUNA — Today in Kuwait's history: Burgan No. 1",
  href: "https://www.kuna.net.kw/ArticleDetails.aspx?id=3276790&language=en",
};
const KOC_PROFILE: Source = {
  label: "KOC Profile (2020) — Burgan, second-largest oil field",
  href: "https://www.kockw.com/sites/EN/Other%20Publications/Corporate/KOC%20Profile%20EN.pdf",
};
const KUNA_1946: Source = {
  label: "KUNA (2016) — the first export, 30 June 1946",
  href: "https://www.kuna.net.kw/ArticleDetails.aspx?id=2509366&language=en",
};
const KPC_HISTORY: Source = {
  label: "KPC — Oil history",
  href: "https://www.kpc.com.kw/OilHistory",
};
const OIL_WEEKLY_1946: Source = {
  label: "The Oil Weekly, 20 May 1946 — the hilltop tanks and offshore berth",
  href: "https://archive.org/details/sim_world-oil_1946-05-20_121_12/page/261/mode/1up",
};

export const CHAPTERS: Chapter[] = [
  {
    numeral: "I",
    index: "Bahra",
    year: "1934 – 1936",
    title: "The first well",
    body:
      "Kuwait Oil Company was incorporated in February 1934, owned equally by Anglo-Persian (now BP) and Gulf Oil. That December, Sheikh Ahmad Al-Jaber Al-Sabah granted it a 75-year concession. In May 1936 it began Kuwait's first well, at Bahra.",
    more:
      "Bahra No. 1 was drilled with a gasoline-powered combination rig — there was too little water for steam — and abandoned in 1937 at 7,950 ft without commercial oil. The rig was moved south, to Burgan.",
    sources: [KUNA_1934, BP_ARCHIVE, WORLD_OIL_1952, PETROLEUM_ENGINEER_1938],
  },
  {
    numeral: "II",
    index: "Burgan",
    year: "1938",
    title: "Burgan",
    body:
      "Burgan No. 1 was spudded in October 1937 with the rig from Bahra. In February 1938 it struck oil at about 3,670 ft. Burgan proved to be the second-largest oil field in the world.",
    more:
      "It is also the world's largest sandstone oil field. Drilling water was seawater, piped in from the coast. The war halted work in 1942 and the wells were sealed with cement; drilling resumed in 1945.",
    sources: [KUNA_BURGAN, KOC_PROFILE, PETROLEUM_ENGINEER_1938, WORLD_OIL_1952],
  },
  {
    numeral: "III",
    index: "First cargo",
    year: "1946",
    title: "The first cargo",
    body:
      "On 30 June 1946, Sheikh Ahmad Al-Jaber turned a silver wheel, and crude ran from tanks on a hilltop above the coast, through lines under the sea, into the tanker British Fusilier.",
    more:
      "It took 11 hours and 13 minutes to load 10,567 tons. That year KOC began building Ahmadi, the town named after Sheikh Ahmad; the company's offices moved there in 1949.",
    sources: [KUNA_1946, KPC_HISTORY, OIL_WEEKLY_1946, KUNA_1934],
  },
  {
    numeral: "IV",
    index: "Today",
    year: "Today",
    title: "Every team, one pad",
    body:
      "Nearly nine decades after Burgan, the work still starts at the rig. Each marker on this pad is one of the group's eight teams — press one to go straight to its dashboards.",
    bodyStill:
      "Nearly nine decades after Burgan, the work still starts at the rig. The group's eight teams, and every one of their dashboards, are a scroll away.",
    more: "",
    sources: [],
  },
];

/** The chapter the page opens on: today. History is one step back. */
export const OPENING = 3;
