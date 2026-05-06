import { useSyncExternalStore, useRef } from 'react';

export interface Store<T> {
  get(): T;
  set(updater: T | ((prev: T) => T)): void;
  subscribe(listener: () => void): () => void;
}

/**
 * Minimal subscribable store with React 18 useSyncExternalStore integration.
 * Returns an object exposing `get`/`set`/`subscribe` plus a callable hook
 * `useStore(selector?)` for components.
 */
export function create<T>(initial: T): Store<T> & {
  <R>(selector: (state: T) => R): R;
  (): T;
} {
  let state = initial;
  const listeners = new Set<() => void>();

  function get(): T {
    return state;
  }

  function set(updater: T | ((prev: T) => T)): void {
    const next = typeof updater === 'function' ? (updater as (p: T) => T)(state) : updater;
    if (next === state) return;
    state = next;
    for (const l of listeners) l();
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function useStore<R>(selector?: (s: T) => R): R | T {
    const select = selector ?? ((s: T) => s as unknown as R);
    const cacheRef = useRef<{ state: T; result: R | T } | null>(null);
    const getSnapshot = () => {
      if (cacheRef.current !== null && cacheRef.current.state === state) {
        return cacheRef.current.result;
      }
      const result = select(state);
      cacheRef.current = { state, result };
      return result;
    };
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  }

  const callable = useStore as Store<T> & {
    <R>(selector: (state: T) => R): R;
    (): T;
  };
  callable.get = get;
  callable.set = set;
  callable.subscribe = subscribe;
  return callable;
}
