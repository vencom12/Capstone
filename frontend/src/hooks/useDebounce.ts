import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * useDebounce Hook
 * 
 * Principle: Debouncing (Trailing-Edge Rate Limiting)
 * Defers updating a state value until a specified quiet period (delay in ms)
 * has elapsed since the last time the value changed.
 * 
 * Used for:
 * - Search query inputs (prevents sending HTTP requests on every keystroke)
 * - Real-time form validations (username/email uniqueness checks)
 * 
 * @param value The value to debounce (e.g. search input text)
 * @param delay Milliseconds to wait after the last change before updating (default: 400ms)
 * @returns The debounced value
 */
export function useDebounce<T>(value: T, delay: number = 400): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Cancel the timeout if value changes before delay expires
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * useDebouncedCallback Hook
 * 
 * Debounces the execution of a callback function.
 * 
 * Used for:
 * - Window resize handlers
 * - Socket event burst consolidations
 * 
 * @param callback The function to execute after the quiet period
 * @param delay Milliseconds to delay
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number = 350
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef<T>(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    (...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  );
}

export default useDebounce;

