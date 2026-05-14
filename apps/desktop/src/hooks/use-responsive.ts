import { useEffect, useState } from "react";

export function useResponsive() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkSize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener("resize", checkSize);
    checkSize(); // Check on initial render

    return () => window.removeEventListener("resize", checkSize);
  }, []);

  return { isMobile };
}
