import Image from "next/image";
import Link from "next/link";

const LINKS = [
  { label: "Protocole", href: "#protocole" },
  { label: "Explorer", href: "#explorer" },
  { label: "Docs", href: "#docs" },
];

export function Footer() {
  return (
    <footer className="mx-auto w-full max-w-5xl border-t px-4">
      <div className="flex flex-col gap-6 py-10 sm:flex-row sm:items-center">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt=""
            width={512}
            height={287}
            className="h-3.5 w-auto"
          />
          <span className="text-[15px] font-semibold tracking-tight">
            Reveal
          </span>
        </Link>

        <nav
          aria-label="Navigation pied de page"
          className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:ml-auto"
        >
          {LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <p className="text-sm text-muted-foreground sm:ml-6">
          © {new Date().getFullYear()} Reveal
        </p>
      </div>
    </footer>
  );
}
