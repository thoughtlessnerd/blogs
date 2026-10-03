// import.meta.env.BASE_URL is the configured `base`. On this project it is
// "/blogs" with NO trailing slash (verified), and it is "/" when no base is
// set. Normalizing both ends makes the join safe in either case.
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
