/**
 * A simple math utility module with a deliberate bug.
 * The bug is in the subtract function - it adds instead of subtracts.
 */

export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a + b; // BUG: Should be a - b
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Division by zero');
  }
  return a / b;
}
