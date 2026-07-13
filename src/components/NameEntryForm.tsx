import { RUNESCAPE_USERNAME_INPUT_PROPS } from '../lib/inputProps';
import { MAX_MEMBER_NAME_LEN } from '../../shared/protocol.ts';
import { MANAGED_COLOR, DISABLED_STYLE } from '../constants/toolColors';

const DEFAULT_INPUT_CLASS = 'flex-1 min-w-0 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500';
const DEFAULT_SUBMIT_CLASS = `px-3 py-1 ${MANAGED_COLOR.border} ${MANAGED_COLOR.label} ${MANAGED_COLOR.borderHover} ${DISABLED_STYLE} text-xs font-medium rounded transition-colors`;

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Called with the trimmed, non-empty name; the caller owns async/busy state. */
  onSubmit: (name: string) => void;
  onCancel: () => void;
  busy?: boolean;
  busyLabel?: string;
  submitLabel?: string;
  inputName: string;
  cancelClassName: string;
  inputClassName?: string;
  submitClassName?: string;
  formClassName?: string;
  /** Also disable the input and Cancel button while busy (fork-join flow). */
  disableWhileBusy?: boolean;
}

/**
 * Inline "username + Join → + Cancel" form used by the open-join, viewer
 * upgrade, and fork-invite flows. Styling divergences between call sites are
 * passed through as class-name props.
 */
export function NameEntryForm({
  value, onChange, onSubmit, onCancel,
  busy = false,
  busyLabel = '…',
  submitLabel = 'Join →',
  inputName,
  cancelClassName,
  inputClassName = DEFAULT_INPUT_CLASS,
  submitClassName = DEFAULT_SUBMIT_CLASS,
  formClassName = 'flex gap-2',
  disableWhileBusy = false,
}: Props) {
  return (
    <form
      autoComplete="off"
      className={formClassName}
      onSubmit={e => {
        e.preventDefault();
        const name = value.trim();
        if (!name || busy) return;
        onSubmit(name);
      }}
    >
      <input
        {...RUNESCAPE_USERNAME_INPUT_PROPS}
        name={inputName}
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Your username"
        maxLength={MAX_MEMBER_NAME_LEN}
        disabled={disableWhileBusy && busy}
        className={inputClassName}
      />
      <button
        type="submit"
        disabled={!value.trim() || busy}
        className={submitClassName}
      >
        {busy ? busyLabel : submitLabel}
      </button>
      <button
        type="button"
        disabled={disableWhileBusy && busy}
        onClick={onCancel}
        className={cancelClassName}
      >
        Cancel
      </button>
    </form>
  );
}
