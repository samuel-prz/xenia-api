export function first<T>(arr: T[]): T | undefined {
  return arr.length > 0 ? arr[0] : undefined;
}

export function required<T>(val: T | undefined, msg = 'Required value missing'): T {
  if (val === undefined || val === null) throw new Error(msg);
  return val;
}