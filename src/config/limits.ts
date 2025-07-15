/**
 * Defines the application's limitations and constants.
 * Centralizing these values makes them easier to manage and update.
 */

// The maximum number of images that can be processed in a single batch.
export const BATCH_LIMIT = 50;

// The maximum number of jobs that can be created per minute from a single IP address.
export const RATE_LIMIT_MAX_REQUESTS = 100;

// The time window for the rate limit in milliseconds.
export const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
