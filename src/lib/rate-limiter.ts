
import { RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } from '@/config/limits';

const requests = new Map<string, { count: number; startTime: number }>();

export function checkRateLimit(ip: string): { success: boolean } {
  const now = Date.now();
  const userRequests = requests.get(ip);

  if (!userRequests) {
    requests.set(ip, { count: 1, startTime: now });
    return { success: true };
  }

  if (now - userRequests.startTime > RATE_LIMIT_WINDOW_MS) {
    // Reset window
    requests.set(ip, { count: 1, startTime: now });
    return { success: true };
  }

  if (userRequests.count < RATE_LIMIT_MAX_REQUESTS) {
    userRequests.count++;
    return { success: true };
  }

  return { success: false };
}

// Clean up old entries periodically to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of requests.entries()) {
    if (now - data.startTime > RATE_LIMIT_WINDOW_MS) {
      requests.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW_MS);
