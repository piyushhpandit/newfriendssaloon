import { cn } from "@/lib/cn";
import { SHOP } from "@/lib/shop";

export function PageHeader(props: {
  kicker: string;
  title?: string;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("card", props.className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-[rgb(var(--muted))]">{props.kicker}</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{props.title ?? SHOP.name}</h1>
          {props.subtitle ? <div className="mt-2 text-sm text-[rgb(var(--muted))]">{props.subtitle}</div> : null}
        </div>
        {props.right ? <div className="shrink-0">{props.right}</div> : null}
      </div>
    </header>
  );
}


