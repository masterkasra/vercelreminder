// In-memory stand-in for the `redis` package (v4 API subset), shared across all handlers in the process
const store = globalThis.__fakeRedisStore || (globalThis.__fakeRedisStore = new Map());
const versions = globalThis.__fakeRedisVersions || (globalThis.__fakeRedisVersions = new Map());
const bump = key => versions.set(key, (versions.get(key) || 0) + 1);

class WatchError extends Error {
  constructor() { super('One (or more) of the watched keys has been changed'); this.name = 'WatchError'; }
}

function createClient() {
  const client = {
    isOpen: false,
    on() {},
    async connect() { this.isOpen = true; },
    async get(key) { return store.has(key) ? store.get(key) : null; },
    async set(key, value, opts = {}) {
      if (opts.NX && store.has(key)) return null;
      store.set(key, String(value)); bump(key); return 'OK';
    },
    async del(key) { const had = store.delete(key); bump(key); return had ? 1 : 0; },
    async incr(key) { const n = (parseInt(store.get(key)) || 0) + 1; store.set(key, String(n)); bump(key); return n; },
    async expire() { return 1; },
    async *scanIterator({ MATCH }) {
      const re = new RegExp('^' + MATCH.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
      for (const key of [...store.keys()]) if (re.test(key)) yield key;
    },
    async executeIsolated(fn) {
      const watched = new Map();
      const isolated = {
        get: key => client.get(key),
        async watch(key) { watched.set(key, versions.get(key) || 0); },
        async unwatch() { watched.clear(); },
        multi() {
          const ops = [];
          const m = {
            set(key, value) { ops.push([key, value]); return m; },
            async exec() {
              if (globalThis.__fakeRedisBeforeExec) { const hook = globalThis.__fakeRedisBeforeExec; globalThis.__fakeRedisBeforeExec = null; await hook(); }
              for (const [key, version] of watched) if ((versions.get(key) || 0) !== version) throw new WatchError();
              for (const [key, value] of ops) await client.set(key, value);
              return ops.map(() => 'OK');
            }
          };
          return m;
        }
      };
      return fn(isolated);
    }
  };
  return client;
}

module.exports.createClient = createClient;
module.exports.WatchError = WatchError;
