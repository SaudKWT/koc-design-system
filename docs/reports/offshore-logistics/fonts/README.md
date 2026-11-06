# Inter, the design system's `fontFamily.sans`

SIL Open Font License 1.1, from Google Fonts.

| File | Used by | Why |
| --- | --- | --- |
| `Inter-latin-var.woff2` | the HTML, inlined as one `@font-face` | 47 KB, variable, covers weight 400 to 700 in a single file |

The two `.ttf` weights that matplotlib used for the email's chart PNGs went
with the email format on 05.11.2026.

The font is vendored rather than fetched: **a KOC work machine cannot be
assumed to reach fonts.gstatic.com.** This sandbox already cannot, and a
`<link>` to Google Fonts fails there with a certificate error. When the font
does not arrive the page falls back to Segoe UI, which is exactly the dated
look the design system replaced.

Inlining also means the page renders with no external request at all, which
matters in a SharePoint preview frame and from a `file://` path.

Per `CLAUDE.md`, Inter replaced Tahoma as "the single biggest reason KOC
dashboards look dated", and the reason it matters here is the same one that
mattered there: true tabular numerals, so a column of figures aligns on the
digit instead of shimmying.
