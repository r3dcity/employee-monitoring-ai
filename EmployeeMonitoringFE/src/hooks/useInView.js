import { useEffect, useRef, useState } from "react";

/** True while the element is on screen (plus a margin), so off-screen videos can disconnect. */
export const useInView = (rootMargin = "200px") => {
  const ref = useRef(null);
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element || !("IntersectionObserver" in window)) return undefined;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin });
    observer.observe(element);
    return () => observer.disconnect();
  }, [rootMargin]);

  return [ref, inView];
};
