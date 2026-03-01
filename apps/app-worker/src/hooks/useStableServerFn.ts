import { useRef } from "react";
import { useServerFn } from "@tanstack/react-start";

type ServerFnInput = Parameters<typeof useServerFn>[0];

export function useStableServerFn<T extends ServerFnInput>(
  fn: T
): ReturnType<typeof useServerFn<T>> {
  const raw = useServerFn(fn);
  const ref = useRef(raw);
  ref.current = raw;

  type Fn = typeof raw;
  return useRef(((...args: Parameters<Fn>) => ref.current(...args)) as Fn)
    .current;
}
