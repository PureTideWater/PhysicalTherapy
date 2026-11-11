// Resolve hook: an extensionless relative import from a .ts file is the .ts file beside it (as the repository's bundler resolution reads it).
export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?[jt]s$|\.json$/.test(specifier) && /\.m?ts$/.test(context.parentURL ?? '')) {
    try { return await next(`${specifier}.ts`, context); } catch { /* fall through */ }
  }
  return next(specifier, context);
}
