import Image from "next/image";
import Link from "next/link";

const LINKS = [
  { label: "Explore", href: "#explore" },
  { label: "Docs", href: "#docs" },
  { label: "Create Token", href: "#create" },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t border-white/10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:flex-row sm:items-center sm:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt=""
            width={512}
            height={287}
            className="h-[18px] w-auto"
            aria-hidden
          />
          <span className="text-[15px] font-semibold tracking-tight">
            Reveal
          </span>
        </Link>

        <nav
          className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:ml-auto"
          aria-label="Navigation pied de page"
        >
          {LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm text-muted transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="text-sm text-subtle sm:ml-6">
          © {new Date().getFullYear()} Reveal
        </p>
      </div>
    </footer>
  );
}
