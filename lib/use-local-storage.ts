import { Dispatch, SetStateAction, useEffect, useState } from "react";
import { parse, stringify } from "superjson";

// https://medium.com/@lean1190/uselocalstorage-hook-for-next-js-typed-and-ssr-friendly-4ddd178676df

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [storedValue, setStoredValue] = useState(initialValue);

  useEffect(() => {
    if (isFirstLoad) {
      const item = window.localStorage.getItem(key);
      if (item) setStoredValue(parse(item) as T);
      setIsFirstLoad(!isFirstLoad);
    }
  }, [key, isFirstLoad]);

  useEffect(() => {
    if (!isFirstLoad) {
      window.localStorage.setItem(key, stringify(storedValue));
    }
  }, [storedValue, key, isFirstLoad]);

  return [storedValue, setStoredValue];
}
