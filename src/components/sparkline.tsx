type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  label?: string;
};

export function Sparkline({
  values,
  width = 120,
  height = 28,
  stroke = "currentColor",
  label
}: SparklineProps) {
  if (values.length === 0) {
    return (
      <span className="inline-block text-[10px] text-[var(--muted-foreground)]" style={{ width }}>
        {label ? `${label}: —` : "—"}
      </span>
    );
  }

  const max = Math.max(100, ...values);
  const min = 0;
  const range = Math.max(1, max - min);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const last = values[values.length - 1] ?? 0;

  return (
    <span className="inline-flex items-center gap-2">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <polyline
          fill="none"
          stroke={stroke}
          strokeWidth={1.4}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
      </svg>
      {label && (
        <span className="text-[10px] text-[var(--muted-foreground)]">
          {label} {last.toFixed(1)}%
        </span>
      )}
    </span>
  );
}
