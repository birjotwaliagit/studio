
const requests = new Map<string, { count: number; startTime: number }>();
const LIMIT = 100; // 100 requests
const DURATION = 60 * 1000; // 1 minute in milliseconds

export function checkRateLimit(ip: string): { success: boolean } {
  const now = Date.now();
  const userRequests = requests.get(ip);

  if (!userRequests) {
    requests.set(ip, { count: 1, startTime: now });
    return { success: true };
  }

  if (now - userRequests.startTime > DURATION) {
    // Reset window
    requests.set(ip, { count: 1, startTime: now });
    return { success: true };
  }

  if (userRequests.count < LIMIT) {
    userRequests.count++;
    return { success: true };
  }

  return { success: false };
}

// Clean up old entries periodically to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of requests.entries()) {
    if (now - data.startTime > DURATION) {
      requests.delete(ip);
    }
  }
}, DURATION);
