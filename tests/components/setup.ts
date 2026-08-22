import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Unmount between tests: RTL renders into a shared document.body, so a
// leftover tree would make the next getByText ambiguous.
afterEach(cleanup);
