import Image from "next/image";
import Link from "next/link";

import { GithubIcon } from "@/components/github-icon";
import { FullWidthDivider } from "@/components/full-width-divider";
import { cn } from "@/lib/utils";

const PRODUCT = [
  { title: "Explore launches", href: "/launchpad" },
  { title: "How it works", href: "/how-it-works" },
  { title: "Launch a token", href: "/create" },
  { title: "Docs", href: "/docs" },
  { title: "Analytics", href: "/analytics" },
];

/**
 * Trois entrées d'ici pointaient vers #brand, #security et #contact : des
 * ancres vers des sections qui n'existent sur aucune page. Un lien qui ne mène
 * nulle part coûte plus qu'une colonne plus courte — il fait croire à une
 * charte graphique, à une politique de divulgation et à une adresse.
 *
 * Ce qui reste mène quelque part. « Security » va aux limites connues, qui
 * disent en toutes lettres que le protocole n'est pas audité.
 */
const COMPANY = [
  { title: "Terms & Policy", href: "/terms" },
  { title: "Security", href: "/docs#limits" },
];

/**
 * L'icône X visait x.com sans compte : un logo qui ouvre la page d'accueil du
 * réseau. Elle revient dès qu'un compte existe — réimporter `XIcon` depuis
 * `@/components/x-icon` et ajouter
 * `{ label: "X", icon: <XIcon />, href: "https://x.com/<compte>" }`.
 * Le composant reste dans le dépôt, et sert déjà aux liens des tokens.
 */
const SOCIALS = [
  {
    label: "GitHub",
    icon: <GithubIcon />,
    href: "https://github.com/draftsify/launchpad-landing",
  },
];

export function Footer() {
  return (
    <footer
      className={cn(
        "relative mx-auto w-full max-w-5xl",
        "dark:bg-[radial-gradient(35%_80%_at_15%_0%,--theme(--color-foreground/.06),transparent)]"
      )}
    >
      <FullWidthDivider className="-top-px" />

      <div className="grid grid-cols-6 gap-6 px-4 py-8">
        <div className="col-span-6 flex flex-col gap-4 md:col-span-4">
          <Link href="/" className="flex w-max items-center gap-2">
            <Image
              src="/logo.png"
              alt=""
              width={512}
              height={287}
              className="h-4 w-auto"
            />
            <span className="text-[15px] font-semibold tracking-tight">
              Reveal
            </span>
          </Link>

          <p className="max-w-sm text-sm text-balance text-muted-foreground">
            The launchpad optimized for price discovery. Rules known upfront, a
            reasonable exit always open.
          </p>

          <div className="flex gap-2">
            {SOCIALS.map((social) => (
              <a
                key={social.label}
                href={social.href}
                target="_blank"
                rel="noreferrer"
                aria-label={social.label}
                className="inline-flex size-9 items-center justify-center rounded-full border bg-card text-foreground transition-colors hover:bg-muted [&_svg]:size-4"
              >
                {social.icon}
              </a>
            ))}
          </div>
        </div>

        <div className="col-span-3 w-full md:col-span-1">
          <span className="text-xs text-muted-foreground">Product</span>
          <div className="mt-2 flex flex-col gap-2">
            {PRODUCT.map(({ href, title }) => (
              <Link
                key={title}
                href={href}
                className="w-max text-sm text-foreground/90 transition-colors hover:text-foreground hover:underline"
              >
                {title}
              </Link>
            ))}
          </div>
        </div>

        <div className="col-span-3 w-full md:col-span-1">
          <span className="text-xs text-muted-foreground">Company</span>
          <div className="mt-2 flex flex-col gap-2">
            {COMPANY.map(({ href, title }) => (
              <Link
                key={title}
                href={href}
                className="w-max text-sm text-foreground/90 transition-colors hover:text-foreground hover:underline"
              >
                {title}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="relative">
        <FullWidthDivider className="-top-px" />
        <p className="py-4 text-center text-sm font-light text-muted-foreground">
          © {new Date().getFullYear()} Reveal. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
