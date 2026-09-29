/**
 * Evaluation → D&W landing — the index of the four directions.
 *
 * Each opens full-screen in the viewer; this page only says what each one is
 * and what it drew on, so the comparison starts from intent rather than taste.
 */

import { ArrowUpRight } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@koc/ui";

import { PageHead, Note } from "../../sections/parts";
import { DASHBOARD_COUNT, TEAMS } from "./data";
import { DIRECTIONS, LANDING_HASH, letterOf, versionOf } from "./directions";

export function LandingDirections() {
  return (
    <div>
      <PageHead
        title="D&W Engineering landing — directions"
        lead={`${DIRECTIONS.filter((d) => versionOf(d.id) === 1).length} directions, each in a first round (v1) and a daily-use round (v2), for the Drilling & Workover Engineering Group hub: ${TEAMS.length} teams, ${DASHBOARD_COUNT} dashboard links, eight group KPIs. Same data in every one — only the design differs.`}
      />

      <Note title="Evaluation only">
        Nothing here is part of the system; the winner gets rewritten into
        it. Every dashboard name and every figure is placeholder — see{" "}
        <code>bakeoff/landing/data.ts</code>. Zero new dependencies: 21st.dev components are
        ported, never installed.
      </Note>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {[...DIRECTIONS].sort((x, y) => versionOf(y.id) - versionOf(x.id)).map((d) => (
          <Card key={d.id}>
            <CardHeader>
              <CardDescription className="font-mono text-xs uppercase">
                Direction {letterOf(d.id)} · v{versionOf(d.id)}
                {versionOf(d.id) === 1 ? " (backup)" : " (daily use)"}
              </CardDescription>
              <CardTitle>
                <a
                  href={`${LANDING_HASH}${d.id}`}
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  {d.name}
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </a>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-muted-foreground">{d.oneLiner}</p>
              {d.references.length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    References
                  </div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                    {d.references.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              {d.components.length > 0 && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Ported from 21st.dev
                  </div>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                    {d.components.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
