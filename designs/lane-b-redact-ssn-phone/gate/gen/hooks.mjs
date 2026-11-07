// Resolve hook for the harvest: any specifier naming redact[.x].ts/.mts outside gate/gen goes to the recorder.
let recorder = '';
let genDir = '';
export async function initialize(data) { recorder = data.recorder; genDir = data.genDir; }
export async function resolve(specifier, context, next) {
  const last = specifier.split('/').pop() ?? '';
  const parent = context.parentURL ?? '';
  if (/^redact(\.[\w-]+)?(\.m?ts)?$/.test(last) && !parent.startsWith(genDir)) {
    return { url: recorder, shortCircuit: true };
  }
  return next(specifier, context);
}
