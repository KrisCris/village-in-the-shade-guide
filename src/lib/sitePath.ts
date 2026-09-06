/** Apply the deployment prefix at the presentation boundary, not to native data. */
export function withBase(path: string, base = import.meta.env.BASE_URL): string {
  if (!path.startsWith('/') || path.startsWith('//')) return path;
  const prefix = `/${(base || '/').replace(/^\/+|\/+$/g, '')}`;
  if (prefix === '/' || path === prefix || path.startsWith(`${prefix}/`)) return path;
  return `${prefix}${path}`;
}
