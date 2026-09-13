// Loaded with `node --import ./tests/register.mjs`: routes `import ... from 'redis'` to the in-memory mock,
// so the real API handlers run in tests without a Redis server.
import { register } from 'node:module';

register('./redis-alias.mjs', import.meta.url);
