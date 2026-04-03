import '@testing-library/jest-dom/vitest';

// Ensure React test utilities treat this environment as act-enabled.
// This keeps the custom DOM harness quiet and avoids false-positive warnings.
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
