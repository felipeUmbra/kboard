import { useEffect, useState } from "react";

export interface Viewport {
  width: number;
  height: number;
  isMobile: boolean;   // < 768
  isTablet: boolean;   // 768–1023
  isDesktop: boolean;  // >= 1024
}

function compute(width: number, height: number): Viewport {
  return {
    width,
    height,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
  };
}

export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(() => {
    if (typeof window === "undefined") return compute(1024, 768);
    return compute(window.innerWidth, window.innerHeight);
  });

  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        setVp(compute(window.innerWidth, window.innerHeight)),
      );
    };
    window.addEventListener("resize", onResize, { passive: true });
    window.addEventListener("orientationchange", onResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return vp;
}
