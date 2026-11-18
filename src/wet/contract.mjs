// The customer's contract, shared by every route. Routes may differ in how they compute an answer.
// They may never differ in what the answer is, what error they throw, or what they leave behind.
export const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const BASE = 62;
export const WIDTH = 5;
export const CAPACITY = BASE ** WIDTH;

export function assertPayload(payload) {
  if (!Number.isSafeInteger(payload) || payload < 0 || payload >= CAPACITY) {
    throw new RangeError(`payload ${payload} is outside the register (0 to ${CAPACITY - 1})`);
  }
}
