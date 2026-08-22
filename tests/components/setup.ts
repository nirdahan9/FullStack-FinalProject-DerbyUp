import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Unmount between tests: RTL renders into a shared document.body, so a
// leftover tree would make the next getByText ambiguous.
afterEach(cleanup);

// Call history too, so "was this action called?" means "in this test".
// Braces matter: a function returned from afterEach is treated as a further
// teardown callback and would be invoked rather than registered.
afterEach(() => {
  vi.clearAllMocks();
});
