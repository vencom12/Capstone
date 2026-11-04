import { useState, useCallback, useRef, useEffect } from 'react';

interface UsePageTransitionOptions {
  initialPage?: number;
  duration?: number;
}

export function usePageTransition({
  initialPage = 1,
  duration = 280,
}: UsePageTransitionOptions = {}) {
  const [page, setPage] = useState(initialPage);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handlePageChange = useCallback(
    (newPage: number) => {
      if (newPage === page) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      setIsTransitioning(true);
      setPage(newPage);
      timerRef.current = setTimeout(() => {
        setIsTransitioning(false);
      }, duration);
    },
    [page, duration]
  );

  const resetPage = useCallback((p = 1) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsTransitioning(false);
    setPage(p);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    page,
    setPage,
    isTransitioning,
    handlePageChange,
    resetPage,
  };
}

