"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { SHOP } from "@/lib/shop";

export function AppShell(props: { children: React.ReactNode }) {
  const pathname = usePathname();
  const inBarber = pathname?.startsWith("/barber") ?? false;

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-10 border-b border-white/10 bg-[rgb(var(--bg))]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white/90">{SHOP.name}</div>
            <div className="truncate text-xs text-white/50">{inBarber ? "Barber portal" : "Customer booking"}</div>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              href="/"
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-semibold",
                !inBarber ? "bg-white text-zinc-900" : "text-white/80 hover:text-white",
              )}
            >
              Book
            </Link>
            <Link
              href="/barber"
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-semibold",
                inBarber ? "bg-white text-zinc-900" : "text-white/80 hover:text-white",
              )}
            >
              Barber
            </Link>
          </nav>
        </div>
      </div>

      <main>{props.children}</main>
    </div>
  );
}


