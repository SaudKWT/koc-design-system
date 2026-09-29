/**
 * Direction A v2 — the drawing's fixed-size glyphs. Every one is decorative (aria-hidden), drawn
 * in `currentColor` or token fills, and sized in whole pixels so 1px strokes land on pixel rows.
 */

/**
 * Wellhead / Christmas tree, front elevation, as line art: tree cap, swab valve, the flow cross
 * with a wing valve and flowline on each side, the master valve, the tubing-head spool and the
 * casing head standing on the ground line (the SVG's bottom edge). Gate valves carry their
 * handwheels. No derrick — the rig is the other direction's; this is the workover-true object:
 * the thing a workover crew actually rigs up to.
 *
 * Two fixed drawings, never one scaled: 64 × 44 on the section drawing (≥768), and a 32 × 34
 * phone variant whose flowlines are stubs, so it sits inside the 16px page gutter. Both put the
 * bore's centre on the SVG's centre line, where the mother bore below it runs.
 */
export function Wellhead({ className, compact = false }: { className?: string; compact?: boolean }) {
  // Every 1px stroke sits on a half-pixel and the 2px spine on a whole one, so nothing is
  // anti-aliased into a grey smear.
  return compact ? (
    <svg
      className={className}
      width="32"
      height="34"
      viewBox="0 0 32 34"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M16 3.5v2M16 10.5v2M16 18.5v2M16 25.5v1" strokeWidth="2" />
      <path d="M12.5 0.5h7v3h-7z" />
      <path d="M11.5 5.5h9l-9 5h9z" />
      <path d="M11.5 20.5h9l-9 5h9z" />
      <path d="M12.5 12.5h7v6h-7z" />
      {/* flowline stubs with their flanges */}
      <path d="M3.5 15.5h9M19.5 15.5h9M3.5 13v5M28.5 13v5" />
      <path d="M8.5 26.5h15v3h-15z" />
      <path d="M5.5 34v-4.5h21V34" />
    </svg>
  ) : (
    <svg
      className={className}
      width="64"
      height="44"
      viewBox="0 0 64 44"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
    >
      {/* the spine: short 2px runs of the bore between the tree's bodies */}
      <path d="M32 4.5v3M32 14.5v3M32 25.5v3M32 35.5v2" strokeWidth="2" />
      {TREE.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/**
 * The tree's bodies on the 64 × 44 grid, without the spine: shared by the header-size glyph above
 * and the footer's section drawing, which draws the same tree at 2× and runs its own bore
 * through it.
 */
export const TREE = [
  // tree cap
  "M27.5 0.5h9v4h-9z",
  // swab valve, then master valve: gate-valve bow-ties on the vertical run, each with its
  // handwheel on a short stem
  "M26.5 7.5h11l-11 7h11z",
  "M26.5 28.5h11l-11 7h11z",
  "M37.5 11.5h4M41.5 8v7M26.5 32.5h-4M22.5 29v7",
  // flow cross
  "M27.5 17.5h9v8h-9z",
  // flowlines, a wing valve on each (handwheel up), and the flange ends
  "M1.5 21.5h7M16.5 21.5h11M36.5 21.5h11M55.5 21.5h7",
  "M8.5 17.5v8l8-8v8zM47.5 17.5v8l8-8v8z",
  "M12.5 17.5v-4M9 13.5h7M51.5 17.5v-4M48 13.5h7",
  "M1.5 18v7M62.5 18v7",
  // tubing-head spool, then the casing head standing on the ground line (bottom edge)
  "M21.5 37.5h21v3h-21z",
  "M17.5 44v-3.5h29V44",
] as const;

/** Ground-level elevation mark: an open triangle whose point touches the line. */
export function LevelMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="9"
      height="6"
      viewBox="0 0 9 6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M0.5 0.5h8L4.5 5.5z" />
    </svg>
  );
}

/**
 * A casing shoe: two small solid triangles at the foot of a casing string's walls, pointing
 * outward, sized to sit on whole-pixel casing walls (surface ±5.5px, liner ±3.5px off the bore).
 */
export function Shoe({ className, variant }: { className?: string; variant: "surface" | "liner" }) {
  const w = variant === "surface" ? 22 : 18;
  const r = variant === "surface" ? 16 : 12;
  return (
    <svg
      className={className}
      width={w}
      height="5"
      viewBox={`0 0 ${w} 5`}
      aria-hidden="true"
      focusable="false"
    >
      <path d={`M6 0V5H1zM${r} 0V5H${r + 5}z`} />
    </svg>
  );
}
