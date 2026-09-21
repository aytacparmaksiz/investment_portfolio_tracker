import { useState, useEffect, useRef } from 'react';

export const usePullToRefresh = (onRefresh: (force?: boolean) => Promise<void>) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startYRef.current = e.touches[0].clientY;
        pullingRef.current = true;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current) return;
      const diff = e.touches[0].clientY - startYRef.current;
      if (diff > 0) {
        const dist = Math.min(diff, 100);
        pullDistanceRef.current = dist;
        setPullDistance(dist);
      }
    };

    const onTouchEnd = async () => {
      if (pullingRef.current && pullDistanceRef.current > 60) {
        setRefreshing(true);
        await onRefreshRef.current(true);
        setRefreshing(false);
      }
      pullDistanceRef.current = 0;
      setPullDistance(0);
      pullingRef.current = false;
    };

    window.addEventListener('touchstart', onTouchStart);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  return { pullDistance, refreshing };
};

