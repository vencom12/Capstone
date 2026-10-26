'use client';

import { useRef, useCallback } from 'react';

export interface UseTouchSwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  minDistance?: number;
  maxVerticalRatio?: number;
  maxTime?: number;
  disabled?: boolean;
}

/**
 * High-performance, bug-free touch swipe gesture hook for touchscreens and mobile devices.
 * 
 * Safety features:
 * - Multi-touch rejection (pinch-to-zoom is ignored)
 * - Horizontal angle verification (ensures vertical page scrolling never triggers a tab switch)
 * - Child scroll containment (does NOT interfere with horizontally scrolling palettes, swatches, or tables)
 * - Input/button protection (typing or tapping buttons will never trigger a swipe)
 * - Light haptic feedback on supported touch devices
 */
export function useTouchSwipe({
  onSwipeLeft,
  onSwipeRight,
  minDistance = 45,
  maxVerticalRatio = 1.4,
  maxTime = 550,
  disabled = false,
}: UseTouchSwipeOptions) {
  const onSwipeLeftRef = useRef(onSwipeLeft);
  onSwipeLeftRef.current = onSwipeLeft;

  const onSwipeRightRef = useRef(onSwipeRight);
  onSwipeRightRef.current = onSwipeRight;

  const touchStartRef = useRef<{ x: number; y: number; time: number; shouldIgnore: boolean }>({
    x: 0,
    y: 0,
    time: 0,
    shouldIgnore: false,
  });

  const isInsideIgnoredElement = (target: EventTarget | null): boolean => {
    if (!target || !(target instanceof Element)) return false;

    // 1. Ignore inputs, buttons, sliders, modals, and explicit no-swipe elements
    if (
      target.closest(
        'input, textarea, select, button, [data-no-swipe="true"], .no-swipe, [role="dialog"], [role="slider"], [role="combobox"]'
      )
    ) {
      return true;
    }

    // 2. Ignore if starting inside an element that has active horizontal scroll of its own
    let el: Element | null = target;
    while (el && el !== document.body) {
      const style = window.getComputedStyle(el);
      const overflowX = style.overflowX;
      if (
        (overflowX === 'auto' || overflowX === 'scroll') &&
        el.scrollWidth > el.clientWidth + 8
      ) {
        return true;
      }
      el = el.parentElement;
    }

    return false;
  };

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (disabled) return;

      // Ignore multi-touch (pinch-to-zoom)
      if (e.touches.length > 1) {
        touchStartRef.current.shouldIgnore = true;
        return;
      }

      const touch = e.touches[0];
      const shouldIgnore = isInsideIgnoredElement(e.target);

      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
        shouldIgnore,
      };
    },
    [disabled]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (disabled || touchStartRef.current.shouldIgnore) return;

      if (e.changedTouches.length === 0) return;
      const touch = e.changedTouches[0];

      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const elapsed = Date.now() - touchStartRef.current.time;

      // 1. Must be completed within maxTime (deliberate swipe, not a prolonged press)
      if (elapsed > maxTime) return;

      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // 2. Must exceed minimum horizontal swipe threshold
      if (absX < minDistance) return;

      // 3. Must be predominantly horizontal (prevents tab jump during vertical page scroll)
      if (absX < absY * maxVerticalRatio) return;

      // Subtle haptic response on supported devices
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(12);
        } catch {
          // ignore if vibration unsupported or restricted
        }
      }

      // DeltaX < 0: swiped finger right-to-left -> Navigate to NEXT tab
      if (deltaX < 0) {
        if (onSwipeLeftRef.current) onSwipeLeftRef.current();
      } else {
        // DeltaX > 0: swiped finger left-to-right -> Navigate to PREVIOUS tab
        if (onSwipeRightRef.current) onSwipeRightRef.current();
      }
    },
    [disabled, minDistance, maxVerticalRatio, maxTime]
  );

  const handleTouchCancel = useCallback(() => {
    touchStartRef.current.shouldIgnore = true;
  }, []);

  return {
    onTouchStart: handleTouchStart,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchCancel,
  };
}
