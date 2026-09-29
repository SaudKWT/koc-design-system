/**
 * The tour: six stops from the rig floor to the bit. Each is a camera
 * keyframe plus the words shown with it. The captions state engineering, not
 * KOC claims — every figure describes the illustrative well in ./well.ts.
 */

import { type V3 } from "./math";
import { BHA, CASING, FORMATIONS, KOP_MD, LANDING_MD, RKB, TD, fmtFt, station } from "./well";

export interface Cam {
  /** Look at the well path at this MD… */
  md?: number;
  /** …or at this world point. */
  target?: V3;
  dist: number;
  /** Radians about y, from +z towards +x. */
  yaw: number;
  pitch: number;
  /** Radial exaggeration of everything downhole. 1 = true proportion. */
  exag: number;
  fov: number;
  /** Multiplies the viewport's lens shift; the plan needs more room than a close-up. */
  shift?: number;
}

export interface SceneLabel {
  text: string;
  md?: number;
  at?: V3;
  /** Chapters (by index) that show it. */
  in: number[];
  side?: "left" | "right" | "below";
  /** "tick": small, unboxed — for dense annotation like formation tops. */
  kind?: "tick";
}

export interface Chapter {
  id: string;
  name: string;
  eyebrow: string;
  title: string;
  detail: string;
  cam: Cam;
}

const part = (kind: string, nth = 0) => BHA.filter((p) => p.kind === kind)[nth];
const mid = (p: { top: number; bottom: number }) => (p.top + p.bottom) / 2;
const land = station(LANDING_MD);

export const CHAPTERS: Chapter[] = [
  {
    id: "rig",
    name: "Rig",
    eyebrow: "Surface · 0 ft",
    title: "2,000 hp land rig",
    detail: "142 ft mast, top drive, 13⅝″ BOP stack under a 30 ft substructure.",
    cam: { target: [-12, 84, 0], dist: 590, yaw: -0.72, pitch: 0.2, exag: 7, fov: 30 },
  },
  {
    id: "plan",
    name: "Well plan",
    eyebrow: `TD ${fmtFt(TD)} MD`,
    title: "Build, hold, build to horizontal",
    detail: `Kick-off at ${fmtFt(KOP_MD)}, 4° and 6°/100 ft builds, lands at ${fmtFt(land.tvd)} TVD, then a 3,000 ft lateral.`,
    cam: { target: [1950, -3000, 0], dist: 15200, yaw: -0.16, pitch: 0.05, exag: 52, fov: 28, shift: 1.25 },
  },
  {
    id: "casing",
    name: "Casing",
    eyebrow: `${CASING[1].name} shoe · ${fmtFt(CASING[1].shoe)}`,
    title: "Telescoping casing",
    detail: "20″ conductor, 13⅜″ surface and 9⅝″ intermediate strings, each a hole size smaller than the last.",
    cam: { md: CASING[1].shoe + 1, dist: 24, yaw: -0.85, pitch: 0.6, exag: 1, fov: 30 },
  },
  {
    id: "build",
    name: "Build",
    eyebrow: "4°/100 ft · 12¼″ hole",
    title: "On the low side",
    detail: "Through the build the string lies on the low side of the hole. That contact is where torque and drag are made.",
    cam: { md: 4380, dist: 1000, yaw: -0.16, pitch: 0.07, exag: 16, fov: 30 },
  },
  {
    id: "bha",
    name: "BHA",
    eyebrow: `8½″ lateral · ${fmtFt(TD - 70)} MD`,
    title: "Rotary-steerable BHA",
    detail: "RSS, LWD and MWD behind spiral-blade stabilisers, then a jar and heavy-weight drill pipe. Cuttings ride the low side up the annulus.",
    cam: { md: TD - 20, dist: 11, yaw: -2.05, pitch: 0.3, exag: 1, fov: 36 },
  },
  {
    id: "bit",
    name: "Bit",
    eyebrow: `Bit depth · ${fmtFt(TD)} MD`,
    title: "8½″ PDC bit",
    detail: "Six blades of 16 mm cutters at 20° back-rake. Steering pads push off the low side as they pass it.",
    cam: { md: TD - 0.9, dist: 4.7, yaw: 1.0, pitch: 0.24, exag: 1, fov: 30 },
  },
];

export const LABELS: SceneLabel[] = [
  // Rig
  { text: "Crown block · 172 ft", at: [0, RKB + 148, 0], in: [0] },
  { text: "Racking board · 88 ft", at: [-11, RKB + 90, 9], in: [0], side: "left" },
  { text: "Top drive", at: [0.3, 89, 1.5], in: [0] },
  { text: "Drill floor · 30 ft", at: [-18, RKB + 1, 18], in: [0], side: "left" },
  { text: "Pipe racks", at: [-96, 6, 20], in: [0], side: "left" },
  { text: "Conductor · 20″", md: 180, in: [0] },
  // Plan
  ...FORMATIONS.map((f, i) => {
    const next = FORMATIONS[i + 1]?.top ?? 4900;
    return { text: f.name, at: [-1150, RKB - (f.top + next) / 2, -350] as V3, in: [1], kind: "tick" as const };
  }),
  { text: `KOP · ${fmtFt(KOP_MD)}`, md: KOP_MD, in: [1] },
  { text: `13⅜″ shoe · ${fmtFt(CASING[1].shoe)}`, md: CASING[1].shoe, in: [1] },
  { text: `Lands ${fmtFt(land.tvd)} TVD · 9⅝″ shoe`, md: LANDING_MD, in: [1], side: "below" },
  { text: `TD · ${fmtFt(TD)} MD`, md: TD, in: [1], side: "below" },
  // Casing
  { text: "13⅜″ float shoe", md: CASING[1].shoe - 0.8, in: [2] },
  { text: "9⅝″ casing", md: CASING[1].shoe - 6, in: [2], side: "left" },
  { text: "12¼″ open hole", md: CASING[1].shoe + 6, in: [2] },
  // Build
  { text: "Tool joints on the low side", md: 4420, in: [3] },
  { text: "9⅝″ couplings every 40 ft", md: 4600, in: [3], side: "below" },
  // BHA
  { text: "Rotary steerable", md: mid(part("rss")), in: [4], side: "below" },
  { text: "Stabiliser", md: mid(part("stab", 0)), in: [4] },
  { text: "LWD · resistivity", md: mid(part("lwd")), in: [4], side: "below" },
  { text: "MWD · mud-pulse telemetry", md: part("mwd").bottom - 5, in: [4] },
  // Bit
  { text: "16 mm PDC cutters", md: TD - 0.08, in: [5] },
  { text: "Steering pads", md: TD - 3, in: [5], side: "left" },
  { text: "Rotary steerable", md: TD - 9, in: [5], side: "left" },
];
