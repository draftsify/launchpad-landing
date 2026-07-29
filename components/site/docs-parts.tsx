import type { Param } from "@/lib/docs";
import { cn } from "@/lib/utils";

export function DocSection({
  id,
  title,
  lede,
  children,
}: {
  id: string;
  title: string;
  lede?: string;
  children?: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 space-y-4">
      <div className="space-y-2">
        <h2 className="text-xl font-medium tracking-tight">{title}</h2>
        {lede && <p className="text-sm text-muted-foreground">{lede}</p>}
      </div>
      {children}
    </section>
  );
}

export function Prose({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl border bg-muted/30 p-4">
      <code className="font-mono text-xs leading-relaxed text-foreground/90">
        {children}
      </code>
    </pre>
  );
}

export function Inline({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground">
      {children}
    </code>
  );
}

export function Callout({
  tone = "note",
  title,
  children,
}: {
  tone?: "note" | "warning";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <aside
      className={cn(
        "rounded-xl border px-4 py-3",
        tone === "warning" ? "border-foreground/25 bg-muted/50" : "bg-muted/25"
      )}
    >
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-1 text-sm text-muted-foreground">{children}</div>
    </aside>
  );
}

export function ParamTable({ params }: { params: Param[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b bg-muted/40">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Parameter
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Type
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Range
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Default
            </th>
          </tr>
        </thead>
        <tbody>
          {params.map((param) => (
            <tr key={param.name} className="border-b last:border-b-0">
              <td className="px-4 py-3 align-top">
                <span className="font-mono text-xs">{param.name}</span>
                <span className="mt-1 block max-w-md text-xs text-muted-foreground">
                  {param.description}
                </span>
              </td>
              <td className="px-4 py-3 align-top font-mono text-xs text-muted-foreground">
                {param.type}
              </td>
              <td className="px-4 py-3 align-top font-mono text-xs text-muted-foreground">
                {param.range}
              </td>
              <td className="px-4 py-3 align-top font-mono text-xs tabular-nums text-muted-foreground">
                {param.fallback}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DefList({
  items,
}: {
  items: { term: string; description: string }[];
}) {
  return (
    <dl className="divide-y rounded-xl border">
      {items.map((item) => (
        <div key={item.term} className="px-4 py-3">
          <dt className="font-mono text-xs break-all text-foreground">
            {item.term}
          </dt>
          <dd className="mt-1 text-sm text-muted-foreground">
            {item.description}
          </dd>
        </div>
      ))}
    </dl>
  );
}
