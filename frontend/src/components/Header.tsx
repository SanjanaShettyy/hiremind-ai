import { Link } from "react-router-dom";

export function Header({ subtitle }: { subtitle?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#05060b]/50 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="orb h-5 w-5" />
          <span className="font-display text-base font-semibold tracking-tight text-white">
            HireMind <span className="text-zinc-400">AI</span>
          </span>
        </Link>

        {subtitle && (
          <span className="chip hidden text-zinc-300 sm:inline-flex">{subtitle}</span>
        )}
      </div>
    </header>
  );
}
