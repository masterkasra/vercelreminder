const mockUrl = new URL('./mocks/redis.cjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'redis') return { url: mockUrl, shortCircuit: true };
  return nextResolve(specifier, context);
}
