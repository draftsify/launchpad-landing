import Image from "next/image";
import Link from "next/link";

import { GithubIcon } from "@/components/github-icon";
import { XIcon } from "@/components/x-icon";
import { FullWidthDivider } from "@/components/full-width-divider";
import { cn } from "@/lib/utils";

const PRODUCT = [
  { title: "Explore launches", href: "/launchpad" },
  { title: "How it works", href: "/how-it-works" },
  { title: "Launch a token", href: "/create" },
  { title: "Docs", href: "/docs" },
  { title: "Analytics", href: "/analytics" },
];

const COMPANY = [
  { title: "Terms & Policy", href: "/terms" },
  { title: "Brand assets", href: "#brand" },
  { title: "Security", href: "#security" },
  { title: "Contact", href: "#contact" },
];

const SOCIALS = [
  { label: "GitHub", icon: <GithubIcon />, href: "https://github.com" },
  { label: "X", icon: <XIcon />, href: "https://x.com" },
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
