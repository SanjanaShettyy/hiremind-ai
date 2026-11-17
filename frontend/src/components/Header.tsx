import { Link } from "react-router-dom";

export function Header({ subtitle }: { subtitle?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-sm font-bold text-white">
            H
          </span>
          <span className="text-base font-semibold tracking-tight text-gray-900">
            HireMind AI
          </span>
        </Link>

        {subtitle && (
          <p className="hidden text-sm text-gray-500 sm:block">{subtitle}</p>
        )}
      </div>
    </header>
  );
}
