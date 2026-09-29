/**
 * Four static L-bracket corners (after Space Hub, https://www.awwwards.com/sites/space-hub) that
 * frame a faceplate: 10px arms, 1.5px, in muted ink. Decorative. The same corner shape, in
 * primary and larger, is the directory's moving viewfinder (Viewfinder.tsx).
 */
export function Corners() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 mx-auto max-w-[90rem] text-muted-foreground">
      <div className="absolute inset-1.5 md:inset-x-2">
        {(["tl", "tr", "bl", "br"] as const).map((at) => (
          <span key={at} data-df2-at={at} className="df2-corner" />
        ))}
      </div>
    </div>
  );
}
