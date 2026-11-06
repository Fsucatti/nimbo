/** Pieces shared by the charts: series colors, axis ticks, legends and table views. */
import { Table2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

/** CSS variables for each measure; the hex values live in the theme. */
export const SERIES = {
  temperature: "var(--temp)",
  feels: "var(--feels)",
  precipitation: "var(--precip)",
  wind: "var(--wind)",
  gust: "var(--gust)",
  humidity: "var(--humidity)",
  pressure: "var(--pressure)",
  solar: "var(--solar)",
  moon: "var(--moonline)",
  neutral: "var(--neutral-mark)",
} as const;

/** "Nice" tick values between min and max with roughly `count` steps. */
export function ticks(min: number, max: number, count = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [min];
  const raw = (max - min) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  const result: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) result.push(Number(v.toFixed(10)));
  return result;
}

/** Expands a domain to tick-aligned bounds, with a minimum span. */
export function niceExtent(values: number[], minSpan: number, step?: number): [number, number] {
  const list = values.filter(Number.isFinite);
  if (list.length === 0) return [0, minSpan];
  let low = Math.min(...list);
  let high = Math.max(...list);
  if (high - low < minSpan) {
    const middle = (high + low) / 2;
    low = middle - minSpan / 2;
    high = middle + minSpan / 2;
  }
  const s = step ?? (ticks(low, high, 4)[1] - ticks(low, high, 4)[0] || minSpan / 4);
  return [Math.floor(low / s) * s, Math.ceil(high / s) * s];
}

export function LegendLine({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="legend-item">
      <svg width="18" height="8" aria-hidden="true">
        <line x1="1" y1="4" x2="17" y2="4" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dashed ? "3 4" : undefined} />
      </svg>
      {label}
    </span>
  );
}

export function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="legend-item">
      <span className="legend-swatch" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * A chart with a "Show table" switch: every chart has a table twin, so no value is
 * reachable only by hovering.
 */
export function ChartFrame({
  title,
  legend,
  controls,
  table,
  children,
  className = "",
}: {
  title?: ReactNode;
  legend?: ReactNode;
  controls?: ReactNode;
  table: () => ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();
  return (
    <figure className={`chart ${className}`}>
      {(title || legend || controls) && (
        <figcaption className="chart-head">
          {title && <span className="chart-title">{title}</span>}
          {legend && <span className="chart-legend">{legend}</span>}
          <span className="chart-controls">
            {controls}
            <button type="button" className="button button-quiet table-toggle" aria-pressed={asTable} aria-controls={id} onClick={() => setAsTable((v) => !v)}>
              <Table2 size={16} aria-hidden="true" />
              {asTable ? "Show chart" : "Show table"}
            </button>
          </span>
        </figcaption>
      )}
      <div id={id}>{asTable ? <div className="table-wrap">{table()}</div> : children}</div>
    </figure>
  );
}

export interface Column<Row> {
  header: string;
  cell: (row: Row) => ReactNode;
  numeric?: boolean;
}

export function DataTable<Row>({ caption, columns, rows, rowKey }: { caption: string; columns: Column<Row>[]; rows: Row[]; rowKey: (row: Row, index: number) => string | number }) {
  return (
    <table className="data-table">
      <caption className="visually-hidden">{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.header} scope="col" className={column.numeric ? "numeric" : undefined}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={rowKey(row, i)}>
            {columns.map((column, c) =>
              c === 0 ? (
                <th key={column.header} scope="row">
                  {column.cell(row)}
                </th>
              ) : (
                <td key={column.header} className={column.numeric ? "numeric" : undefined}>
                  {column.cell(row)}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
