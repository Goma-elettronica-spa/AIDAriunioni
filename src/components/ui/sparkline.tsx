export function Sparkline({
  values,
  width = 120,
  height = 32,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (!values.length) return null;

  const padding = 4;
  const dotRadius = 2.5;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = padding + (values.length === 1 ? innerW / 2 : (i / (values.length - 1)) * innerW);
    const y = padding + innerH - ((v - min) / range) * innerH;
    return { x, y };
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      className="inline-block"
    >
      <polyline
        points={polylinePoints}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx={last.x} cy={last.y} r={dotRadius} fill="currentColor" />
    </svg>
  );
}
