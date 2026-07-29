import { Header } from "@/components/site/header";
import { Footer } from "@/components/site/footer";
import { FrameShimmer } from "@/components/site/frame-shimmer";

/**
 * Ossature commune à toutes les pages : header collant, colonne centrale
 * encadrée par deux filets verticaux, footer.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden px-4 supports-[overflow:clip]:overflow-clip">
      <Header />

      {/* Les pseudo-éléments tracent les filets verticaux, qui débordent
          volontairement au-delà des sections. */}
      <main className="relative mx-auto w-full max-w-5xl grow before:absolute before:-inset-y-20 before:-left-px before:z-1 before:bg-border after:absolute after:-inset-y-20 after:-right-px after:z-1 after:bg-border md:before:w-px md:after:w-px">
        <FrameShimmer />
        {children}
      </main>

      <Footer />
    </div>
  );
}
