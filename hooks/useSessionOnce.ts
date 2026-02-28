'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Tracks whether an action has already run this browser session.
 * Uses sessionStorage — resets when the tab/window closes.
 *
 * @param key - Unique storage key
 * @returns [hasRun, markAsRun]
 */
export function useSessionOnce(key: string) {
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(key) === '1') {
        setHasRun(true);
      }
    } catch {
      /* sessionStorage unavailable — treat as first visit */
    }
  }, [key]);

  const markAsRun = useCallback(() => {
    try {
      sessionStorage.setItem(key, '1');
    } catch {
      /* silent */
    }
    setHasRun(true);
  }, [key]);

  return [hasRun, markAsRun] as const;
}
