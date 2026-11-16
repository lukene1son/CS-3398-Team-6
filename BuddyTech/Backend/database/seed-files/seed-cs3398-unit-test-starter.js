// Unit Testing Lab: starter file.
// Copy this next to the route you're testing, then run: npx jest
//
// 1. Replace the fake handler with a require() of your real route's logic.
// 2. Keep the three cases below and add at least two of your own.

function addNumbers(a, b) {
  if (typeof a !== "number" || typeof b !== "number") throw new TypeError("numbers only");
  return a + b;
}

describe("addNumbers", () => {
  test("adds two numbers", () => {
    expect(addNumbers(2, 3)).toBe(5);
  });

  test("works with negatives", () => {
    expect(addNumbers(-4, 1)).toBe(-3);
  });

  test("rejects strings", () => {
    expect(() => addNumbers("2", 3)).toThrow(TypeError);
  });
});
