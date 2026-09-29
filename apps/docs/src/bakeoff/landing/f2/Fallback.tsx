/**
 * No WebGL2: a still, drawn from the same derrick proportions the 3D model
 * uses (122 ft on a 24 ft base, panels shrinking toward the crown), as line
 * art over the fog gradient. Colours are tokens via currentColor.
 */

const H = 122, BASE = 24, TOP = 5.5, PANELS = 13;

function derrickLines(cx: number, groundY: number, scale: number) {
  const ratio = 0.93;
  const first = (H * (1 - ratio)) / (1 - Math.pow(ratio, PANELS));
  const levels = [0];
  for (let p = 0, h = first; p < PANELS; p++, h *= ratio) levels.push(levels[p] + h);
  const half = (y: number) => ((BASE + (TOP - BASE) * (y / H)) / 2) * scale;
  const Y = (y: number) => groundY - y * scale;
  const d: string[] = [];
  d.push(`M${cx - half(0)} ${Y(0)} L${cx - half(H)} ${Y(H)}`, `M${cx + half(0)} ${Y(0)} L${cx + half(H)} ${Y(H)}`);
  for (let p = 0; p < levels.length; p++) {
    const y = levels[p];
    d.push(`M${cx - half(y)} ${Y(y)} L${cx + half(y)} ${Y(y)}`);
    if (p < levels.length - 1) {
      const y2 = levels[p + 1];
      d.push(`M${cx - half(y)} ${Y(y)} L${cx + half(y2)} ${Y(y2)}`, `M${cx + half(y)} ${Y(y)} L${cx - half(y2)} ${Y(y2)}`);
    }
  }
  d.push(`M${cx - half(H) * 1.2} ${Y(H) - 2} L${cx} ${Y(H) - 12} L${cx + half(H) * 1.2} ${Y(H) - 2}`);
  return d.join(" ");
}

export function Fallback() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 -z-10"
      style={{
        background:
          "radial-gradient(120% 90% at 15% 20%, color-mix(in oklab, var(--primary) 14%, var(--background)) 0%, transparent 60%), radial-gradient(110% 80% at 90% 70%, color-mix(in oklab, var(--success) 10%, var(--background)) 0%, transparent 60%), var(--background)",
      }}
    >
      <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 size-full text-muted-foreground">
        <ellipse cx="1080" cy="1060" rx="760" ry="250" fill="currentColor" opacity="0.12" />
        <path d={derrickLines(1080, 820, 4.6)} fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.6" />
        <path d={derrickLines(1320, 850, 2.4)} fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
        <line x1="0" y1="818" x2="1600" y2="818" stroke="var(--primary)" strokeWidth="1" opacity="0.45" />
      </svg>
    </div>
  );
}
