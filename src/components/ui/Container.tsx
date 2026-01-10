import { cn } from "@/lib/cn";

export function Container(props: { className?: string; children: React.ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-lg px-4 py-5", props.className)}>{props.children}</div>;
}


