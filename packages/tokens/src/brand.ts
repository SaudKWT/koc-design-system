/**
 * KOC brand facts.
 *
 * Every value here was extracted from Kuwait Oil Company's live properties on
 * 2026-07-16 — not chosen by taste. Provenance is recorded per value so future
 * maintainers can re-verify or challenge them.
 *
 * Method: kockw.com was loaded in a real browser and its stylesheets were read
 * from `document.styleSheets`. Colours were counted per-sheet so that KOC's
 * hand-authored `custom.css` could be separated from the Bootstrap 4 defaults
 * the site ships with. Only colours originating in KOC-authored sheets are
 * treated as brand.
 *
 * NOTE: public "brand asset" aggregators (brandfetch, logotyp.us) and several
 * AI-generated SEO pages describe the KOC logo as a "blue, gold and red oil
 * droplet". That is false. The real mark — verified by rendering the official
 * SVG — is a white falcon inside an oval ring with bilingual AR/EN wordmarks.
 * Do not reintroduce gold/red as brand colours on the strength of those pages.
 */

export interface BrandFact<T> {
  readonly value: T;
  /** Where this came from, precisely enough to re-verify. */
  readonly source: string;
  readonly confidence: "confirmed" | "derived" | "assumed";
}

const fact = <T>(
  value: T,
  source: string,
  confidence: BrandFact<T>["confidence"] = "confirmed",
): BrandFact<T> => ({ value, source, confidence });

/**
 * The KOC blue. This is the single anchor the entire primary scale derives from.
 *
 * Appears 29× in KOC's own custom.css — applied to `h1, h2` among others — and
 * 182× in the rendered page. It is unambiguously the house colour.
 */
export const KOC_PRIMARY = fact(
  "#0060A9",
  "kockw.com custom.css — rgb(0,96,169) on `h1, h2`; 29 rule-level uses, 182 computed uses",
);

/**
 * Darker blues KOC uses for navigation, hover and pressed affordances. They sit
 * close enough together that they read as one intent: "primary, but recessed".
 * We use them to sanity-check the dark end of the generated ramp rather than as
 * separate tokens.
 */
export const KOC_DARK_BLUES = fact(
  ["#0C538A", "#085590", "#054C82", "#074A7C"] as const,
  "kockw.com custom.css (.searchBox .input-group-text, .topNav ul ul li:hover) + sharepointOverwrite.css (.o365cs-topnavLinkBackground-2)",
);

/** Light blue used for nav hover text — anchors the light end of the ramp. */
export const KOC_LIGHT_BLUE = fact(
  "#A3D7FF",
  "kockw.com custom.css — .topNav ul li a:hover",
);

/** Neutral greys KOC uses for headings and body copy. */
export const KOC_GREYS = fact(
  {
    heading: "#505050",
    subheading: "#737373",
    body: "#6D6C71",
  },
  "kockw.com custom.css — h2/h3/.ms-headerFont (#505050), h3 (#737373), .text-color-grey (#6D6C71)",
);

/**
 * The official logo: a white falcon in an oval ring, with Arabic and English
 * wordmarks and the KPC subsidiary endorsement line.
 *
 * Ships white-only (`fill="white"`), so it requires a coloured backdrop. It has
 * no colour information of its own — which is exactly why the palette had to be
 * recovered from CSS instead.
 */
export const KOC_LOGO = fact(
  {
    url: "https://www.kockw.com/sites/EN/SiteAssets/kockwTheme2020/img/kocLogo.svg",
    local: "assets/brand/koc-logo.svg",
    viewBox: "0 0 293 292",
    fill: "white" as const,
    bilingual: true,
    requiresDarkBackdrop: true,
  },
  "Downloaded from kockw.com and rendered to verify; all paths fill=white",
);

/**
 * What KOC runs today. Recorded as the migration baseline — this is the thing
 * the design system exists to replace.
 */
export const KOC_LEGACY_STACK = fact(
  {
    fonts: "Tahoma, Arial, Helvetica, sans-serif",
    css: "Bootstrap 4",
    platform: "SharePoint",
  },
  "kockw.com — 471 elements computed to Tahoma; bootstrap.css + sharepointOverwrite.css present",
);
