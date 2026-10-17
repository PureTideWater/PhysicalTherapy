/**
 * What a Write, Edit or MultiEdit would leave in a file, rebuilt from the hook input Claude Code hands a
 * PreToolUse hook and the file as it is on disk, so the fixture hook checks the file that would result
 * rather than the fragment an edit carries (.claude/hooks/fixture-guard.sh, docs/adr/0059).
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

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** One edit applied as Claude Code applies it; null when it cannot apply (its text is not in the file). */
function applyEdit(current: string | null, edit: HookEdit): string | null {
  const oldString = text(edit.old_string);
  const newString = text(edit.new_string);
  if (oldString === '') {
    // An empty old_string creates the file, or fills an empty one.
    return current === null || current === '' ? newString : null;
  }
  if (current === null) {
    return null;
  }
  const at = current.indexOf(oldString);
  if (at < 0) {
    return null;
  }
  if (edit.replace_all === true) {
    return current.split(oldString).join(newString);
  }
  // Without replace_all, Claude Code refuses an old_string the file holds more than once.
  if (current.split(oldString).length > 2) {
    return null;
  }
  return current.slice(0, at) + newString + current.slice(at + oldString.length);
}

/**
 * The file's text after the tool call, or null when the call writes nothing: another tool, or an edit
 * that cannot apply (Claude Code refuses it, so nothing reaches the file). `current` is the file's text
 * now, null when there is no file.
 */
export function resultingText(input: HookInput, current: string | null): string | null {
  const toolInput = input.tool_input ?? {};
  switch (input.tool_name) {
    case 'Write':
      return text(toolInput.content);
    case 'Edit':
      return applyEdit(current, toolInput);
    case 'MultiEdit': {
      const edits: readonly unknown[] = Array.isArray(toolInput.edits) ? toolInput.edits : [];
      let result: string | null = current;
      for (const edit of edits) {
        result = applyEdit(result, typeof edit === 'object' && edit !== null ? edit : {});
        if (result === null) {
          return null;
        }
      }
      return edits.length === 0 ? null : result;
    }
    default:
      return null;
  }
}
