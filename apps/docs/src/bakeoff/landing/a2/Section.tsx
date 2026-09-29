/**
 * Section A–A: the footer's showpiece. The group drawn as one multilateral well, in full and to
 * scale: a 2× wellhead on the ground line, the conductor and surface casing with their shoes, one
 * mother bore to TD, and the eight laterals kicked off in code order, alternating east and west.
 * Each lateral is ONE UNIT LONG PER DASHBOARD and carries one station tick per dashboard, so the
 * drawing is honest: EN11's seven-unit lateral is the longest because it has seven dashboards.
 *
 * It is decoration (aria-hidden); every fact it shows is in the directory above, and its caption
 * is real text beside it.
 *
 * Geometry: one fixed 1360 × 420 px drawing, never scaled, centred in the footer and clipped by
 * the sheet. Text stays 11px at every width, and the bit can follow the same coordinates with
 * `offset-path` because nothing is resized. At 1440 it spans the page; narrower, the sheet's
 * edges crop the outer laterals, as a drawing runs off a sheet. Nothing is measured.
 *
 * Motion (AMBIENT; see multilateral.css):
 *  - construction draw-on, once, when the footer first comes into view;
 *  - then the bit: it runs down the bore and out along each lateral in turn, a 16s cycle, only
 *    while the footer is on screen and the tab is visible;
 *  - under reduced motion (OS or the viewer's flag), neither: the drawing is simply drawn.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { TEAMS } from "../data";
import { useReducedMotion } from "../shared";

import { TREE } from "./glyphs";

const W = 1360;
const H = 420;
/** The bore. Half-pixel coordinates put 1px strokes on whole pixel rows. */
const X = 680;
const GL = 104.5;
const TD = 400;
const R = 40; // build radius
const UNIT = 72; // one dashboard

const LATERALS = TEAMS.map((team, k) => {
  const y = 184.5 + k * 28; // the lateral's horizontal leg
  const dir = k % 2 === 0 ? 1 : -1; // even codes east, odd codes west
  const kop = y - R;
  const heel = X + dir * R;
  const n = team.links.length;
  const toe = heel + dir * n * UNIT;
  const sweep = dir > 0 ? 0 : 1;
  const arc = `A${R} ${R} 0 0 ${sweep} ${heel} ${y}`;
  return {
    team,
    k,
    y,
    dir,
    kop,
    heel,
    toe,
    n,
    /** The lateral itself: kick-off curve, then the horizontal leg to the toe. */
    d: `M${X} ${kop}${arc}H${toe}`,
    /** The bit's run: down the bore from the ground line, then out along the lateral. */
    run: `M${X} ${GL}V${kop}${arc}H${toe}`,
    /** When the bore's draw-on reaches this kick-off, as a share of the bore's run. */
    at: (kop - GL) / (TD - GL),
  };
});

const EN11 = LATERALS[1];

/**
 * Draw-on once per page view when the footer first comes into view; afterwards, "play" only
 * while it is on screen and the tab is visible. Under reduced motion, neither.
 *
 * `quiet` is true while a search is in the field. A search collapses the directory and can pull
 * the footer up under the results; the drawing then holds still — if it has not been drawn yet
 * it is simply drawn, with no construction, and the bit waits until the search is cleared.
 */
function useSectionMotion(quiet: boolean) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setOnScreen(entry.isIntersecting);
        if (entry.isIntersecting) setSeen(true);
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const sync = () => setTabVisible(document.visibilityState === "visible");
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  // The draw-on's last line lands at ≈ 1.3s; the attribute that carries it comes off after.
  // Seen for the first time mid-search: drawn at once, never constructed.
  useEffect(() => {
    if (!seen || drawn) return;
    if (quiet) {
      setDrawn(true);
      return;
    }
    const t = window.setTimeout(() => setDrawn(true), 1600);
    return () => window.clearTimeout(t);
  }, [seen, drawn, quiet]);

  const draw = reduced || drawn || quiet ? undefined : seen ? "run" : "armed";
  const play = !reduced && !quiet && drawn && onScreen && tabVisible ? "on" : "off";
  return { ref, draw, play };
}

export function SectionDrawing({ quiet = false }: { quiet?: boolean }) {
  const { ref, draw, play } = useSectionMotion(quiet);

  return (
    <div
      ref={ref}
      className="ms2-sec"
      data-ms2-draw={draw}
      data-ms2-play={play}
      aria-hidden="true"
    >
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} focusable="false" className="ms2-sec-svg">
        {/* Formation tops: faint, unlabelled — this is a section, not a geological claim. */}
        <g className="ms2-sec-strata">
          <path d="M0 158C300 150 620 166 900 157S1220 149 1360 160" />
          <path d="M0 270C340 263 700 279 1020 269S1260 262 1360 268" />
          <path d="M0 356C280 364 640 348 980 356S1240 366 1360 360" />
        </g>

        {/* Ground line, with its level mark at the right (the caption holds the left). */}
        <path className="ms2-sec-gl" d={`M0 ${GL}H${W}`} />
        <path className="ms2-sec-mark" d={`M${W - 60.5} ${GL - 7}h9l-4.5 6z`} />
        <text className="ms2-sec-note" x={W - 45} y={GL - 2}>
          GL
        </text>

        {/* The tree at 2×, standing on the ground line; the bore runs up through it. */}
        <g transform={`translate(${X - 63.5} ${GL - 88}) scale(2)`} className="ms2-sec-tree">
          {TREE.map((d) => (
            <path key={d} d={d} vectorEffect="non-scaling-stroke" />
          ))}
        </g>

        {/* Conductor and surface casing: two walls each, with outward shoes at the foot. */}
        <g className="ms2-sec-casing">
          <path d={`M${X - 15.5} ${GL}V128M${X + 15.5} ${GL}V128`} />
          <path d={`M${X - 9.5} ${GL}V138M${X + 9.5} ${GL}V138`} />
        </g>
        <g className="ms2-sec-shoe">
          <path d={`M${X - 15} 123v5h-6zM${X + 15} 123v5h6z`} />
          <path d={`M${X - 9} 133v5h-5zM${X + 9} 133v5h5z`} />
        </g>

        {/* The mother bore, ground line to TD. */}
        <path className="ms2-sec-bore" d={`M${X} ${GL}V${TD}`} pathLength={1} />
        <path className="ms2-sec-td" d={`M${X - 7} ${TD + 1}H${X + 7}`} />
        <text className="ms2-sec-note" x={X + 12} y={TD + 5}>
          TD
        </text>
        <text className="ms2-sec-note" x={X - 12} y={LATERALS[0].kop + 4} textAnchor="end">
          KOP
        </text>

        {LATERALS.map((l) => (
          <g key={l.team.code} style={{ "--ms2-at": l.at, "--ms2-k": l.k } as CSSProperties}>
            <path className="ms2-sec-lat" d={l.d} pathLength={1} />
            {/* One station tick per dashboard, centred in its unit, hanging below the leg. */}
            {Array.from({ length: l.n }, (_, j) => {
              const x = l.heel + l.dir * (UNIT / 2 + j * UNIT) + 0.5;
              return (
                <path
                  key={j}
                  className="ms2-sec-tick"
                  d={`M${x} ${l.y}v6`}
                  style={{ "--ms2-j": j } as CSSProperties}
                />
              );
            })}
            <path className="ms2-sec-toe" d={`M${l.toe + 0.5 * l.dir} ${l.y - 5}v11`} />
            <text
              className="ms2-sec-code"
              x={l.toe + l.dir * 10}
              y={l.y + 4}
              textAnchor={l.dir > 0 ? "start" : "end"}
            >
              {l.team.code}
            </text>
          </g>
        ))}

        {/* A draughtsman's dimension on the longest lateral: its length, in dashboards. */}
        <g className="ms2-sec-dim" style={{ "--ms2-at": EN11.at } as CSSProperties}>
          <path d={`M${EN11.toe + 0.5} ${EN11.y + 9}v14M${EN11.heel + 0.5} ${EN11.y + 9}v14`} />
          <path d={`M${EN11.toe + 1} ${EN11.y + 18}H${(EN11.toe + EN11.heel) / 2 - 44}M${(EN11.toe + EN11.heel) / 2 + 44} ${EN11.y + 18}H${EN11.heel}`} />
        </g>
        <path
          className="ms2-sec-shoe"
          d={`M${EN11.toe + 1} ${EN11.y + 18}l7-3v6zM${EN11.heel} ${EN11.y + 18}l-7-3v6z`}
        />
        <text
          className="ms2-sec-note"
          x={(EN11.toe + EN11.heel) / 2}
          y={EN11.y + 22}
          textAnchor="middle"
        >
          {`${EN11.n} dashboards`}
        </text>
      </svg>

      {/* The bit: a capsule on each lateral's run (the Animated Badge offset-path technique). */}
      {LATERALS.map((l) => (
        <span
          key={l.team.code}
          className="ms2-sec-bit"
          style={{ offsetPath: `path("${l.run}")`, "--ms2-k": l.k } as CSSProperties}
        />
      ))}
    </div>
  );
}
