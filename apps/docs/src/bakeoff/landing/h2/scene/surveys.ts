/** The five wells, surveyed once at import. Shared by the 3D view, overlay and fallback. */

import { survey, WELL_PLANS, type Survey } from "./wells";

export const SURVEYS: Survey[] = WELL_PLANS.map((p) => survey(p, 720));
export const ACTIVE_SURVEY = SURVEYS.find((s) => s.plan.status === "drilling")!;
export const DEEP_SURVEY = SURVEYS.find((s) => s.plan.status === "deep")!;
