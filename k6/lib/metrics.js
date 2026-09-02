// Custom metrics shared across scenarios. Instantiated here in init context so
// they always appear in handleSummary(), even at zero.
import { Counter } from 'k6/metrics';

export const rl429 = new Counter('rate_limited_429');
export const se5xx = new Counter('server_error_5xx');
