import { useState, useEffect } from 'react';

export const usePullToRefresh = (onRefresh: (force?: boolean) => Promise<void>) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let startY = 0;
    let pulling = false;

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startY = e.touches[0].clientY;
        pulling = true;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling) return;
      const diff = e.touches[0].clientY - startY;
      if (diff > 0) setPullDistance(Math.min(diff, 100));
    };

    const onTouchEnd = async () => {
      if (pulling && pullDistance > 60) {
        setRefreshing(true);
        await onRefresh(true);
        setRefreshing(false);
      }
      setPullDistance(0);
      pulling = false;
    };

    window.addEventListener('touchstart', onTouchStart);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [pullDistance, onRefresh]);

  return { pullDistance, refreshing };
};
