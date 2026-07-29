import { Header } from "@/components/site/header";
import { Hero } from "@/components/site/hero";
import { TokenMarquee } from "@/components/site/token-marquee";
import { Footer } from "@/components/site/footer";

export default function Home() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden px-4 supports-[overflow:clip]:overflow-clip">
      <Header />

      {/* Les pseudo-éléments tracent les deux filets verticaux qui encadrent
          la colonne centrale et débordent au-delà des sections. */}
      <main className="relative mx-auto w-full max-w-5xl grow before:absolute before:-inset-y-20 before:-left-px before:z-1 before:bg-border after:absolute after:-inset-y-20 after:-right-px after:z-1 after:bg-border md:before:w-px md:after:w-px">
        <Hero />
        <TokenMarquee />
      </main>

      <Footer />
    </div>
  );
}
