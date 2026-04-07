export function toBoolFlag(value: number | null | undefined): boolean {
  return Number(value ?? 0) === 1;
}

export function toDbFlag(value: boolean | undefined): number | undefined {
  if (value === undefined) return undefined;
  return value ? 1 : 0;
}