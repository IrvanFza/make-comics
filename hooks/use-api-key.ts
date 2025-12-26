"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "together_api_key";
const STORAGE_EVENT = "apiKeyChanged";

/**
 * Reactive hook for managing the Together API key in localStorage.
 * Automatically syncs across components and tabs when the key changes.
 * 
 * @returns {[string | null, (key: string | null) => void]} Tuple of [apiKey, setApiKey]
 */
export function useApiKey(): [string | null, (key: string | null) => void] {
  const [apiKey, setApiKeyState] = useState<string | null>(null);

  // Initialize from localStorage on mount
  useEffect(() => {
    const readFromStorage = () => {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem(STORAGE_KEY);
        setApiKeyState(stored);
      }
    };

    readFromStorage();

    // Listen for storage events (cross-tab updates)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setApiKeyState(e.newValue);
      }
    };

    // Listen for custom events (same-tab updates)
    const handleCustomStorageChange = () => {
      readFromStorage();
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(STORAGE_EVENT, handleCustomStorageChange);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(STORAGE_EVENT, handleCustomStorageChange);
    };
  }, []);

  // Setter function that updates both localStorage and state, and dispatches event
  const setApiKey = useCallback((key: string | null) => {
    if (typeof window !== "undefined") {
      if (key === null) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, key);
      }
      setApiKeyState(key);
      // Dispatch custom event for same-tab reactivity
      window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
    }
  }, []);

  return [apiKey, setApiKey];
}

