// Vitest setup file - runs before all tests
// Set required environment variables before any modules are imported
process.env.HMAC_SECRET = "test-secret-key-for-testing";
process.env.LEMON_SQUEEZY_API_KEY = "test-api-key";
process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = "test-webhook-secret";

// Mock vi.mock for hoisted mocks
import { vi } from "vitest";

// Ensure vi is available globally
(globalThis as any).vi = vi;
