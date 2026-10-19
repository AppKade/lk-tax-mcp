// Decimal strings at the boundary, bigint cents inside. Never use Number for money.
export const MONEY_PATTERN = /^(0|[1-9]\d{0,14})(\.\d{1,2})?$/;
export function cents(value: string): bigint {
  if (typeof value !== 'string' || !MONEY_PATTERN.test(value)) throw new Error('INVALID_MONEY');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}
export function money(value: bigint): string {
  if (value < 0n) throw new Error('INVALID_MONEY');
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
}
export const min = (a: bigint, b: bigint) => a < b ? a : b;
export const nonnegative = (a: bigint) => a < 0n ? 0n : a;
