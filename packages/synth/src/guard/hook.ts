/**
 * What a Write, Edit or MultiEdit would leave in a file, rebuilt from the hook input Claude Code hands a
 * PreToolUse hook and the file as it is on disk, so the fixture hook checks the file that would result
 * rather than the fragment an edit carries (.claude/hooks/fixture-guard.sh, docs/adr/0059).
 *
 * An edit is rebuilt only when its old_string is in the file exactly as written (once, or with replace_all).
 * Claude Code applies more than that: it matches an old_string against the file with CRLF read as LF and
 * curly quotes read as straight ones. The guard does not imitate that matching; an edit it cannot rebuild
 * exactly is an UnbuildableEditError, and the hook refuses it, so the guard fails closed instead of letting
 * through a result it never saw.
 */

export interface HookEdit {
  readonly old_string?: unknown;
  readonly new_string?: unknown;
  readonly replace_all?: unknown;
}

export interface HookInput {
  readonly tool_name?: unknown;
  readonly tool_input?: HookEdit & { readonly file_path?: unknown; readonly content?: unknown; readonly edits?: unknown };
}

/** An Edit or MultiEdit whose result the guard cannot rebuild exactly from the call and the file on disk. */
export class UnbuildableEditError extends Error {
  override readonly name = 'UnbuildableEditError';
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** One edit applied exactly; throws UnbuildableEditError when its old_string is not in the file as written. */
function applyEdit(current: string | null, edit: HookEdit): string {
  const oldString = text(edit.old_string);
  const newString = text(edit.new_string);
  if (oldString === '') {
    // An empty old_string creates the file, or fills an empty one.
    if (current === null || current === '') {
      return newString;
    }
    throw new UnbuildableEditError('an edit with an empty old_string on a file that has text');
  }
  if (current === null) {
    throw new UnbuildableEditError('an edit of a file that does not exist');
  }
  const at = current.indexOf(oldString);
  if (at < 0) {
    throw new UnbuildableEditError('an edit whose old_string is not in the file exactly as written');
  }
  if (edit.replace_all === true) {
    return current.split(oldString).join(newString);
  }
  if (current.split(oldString).length > 2) {
    throw new UnbuildableEditError('an edit whose old_string is in the file more than once, without replace_all');
  }
  return current.slice(0, at) + newString + current.slice(at + oldString.length);
}

/**
 * The file's text after the tool call, or null when the call writes nothing: a tool the guard does not
 * handle, or a MultiEdit of no edits on a file that does not exist. `current` is the file's text now, null
 * when there is no file. Throws UnbuildableEditError for an Edit or MultiEdit it cannot rebuild exactly.
 */
export function resultingText(input: HookInput, current: string | null): string | null {
  const toolInput = input.tool_input ?? {};
  switch (input.tool_name) {
    case 'Write':
      return text(toolInput.content);
    case 'Edit':
      return applyEdit(current, toolInput);
    case 'MultiEdit': {
      const edits: unknown = toolInput.edits ?? [];
      if (!Array.isArray(edits)) {
        throw new UnbuildableEditError('a MultiEdit whose edits are not a list');
      }
      let result: string | null = current;
      for (const edit of edits as readonly unknown[]) {
        result = applyEdit(result, typeof edit === 'object' && edit !== null ? edit : {});
      }
      return result;
    }
    default:
      return null;
  }
}
