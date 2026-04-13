import { Link, Unlink, Copy, Check } from 'lucide-react';
import { SplitButton, SplitButtonSegment } from './ui/split-button';
import { ALT1_BORDER_COLOR, ALT1_DIVIDE_COLOR, ALT1_HOVER_BG, ALT1_COLOR } from '../constants/toolColors';

interface Alt1TokenButtonProps {
  identityToken: string;
  scoutConnected: boolean;
  tokenCopied: boolean;
  onCopy: () => void;
  /** If provided, also called on main segment click (e.g. open session panel from session bar) */
  onOpen?: () => void;
}

export function Alt1TokenButton({ identityToken, scoutConnected, tokenCopied, onCopy, onOpen }: Alt1TokenButtonProps) {
  return (
    <SplitButton
      borderClass={ALT1_BORDER_COLOR}
      divideClass={ALT1_DIVIDE_COLOR}
      hoverClass={ALT1_HOVER_BG}
    >
      <SplitButtonSegment
        className="gap-1.5"
        onClick={() => { onCopy(); onOpen?.(); }}
        title={onOpen ? 'Copy Alt1 link & open session panel' : 'Copy Alt1 link'}
      >
        {scoutConnected
          ? <Link className={`w-3 h-3 ${ALT1_COLOR.text}`} />
          : <Unlink className="w-3 h-3 text-gray-500" />
        }
        <span className="font-mono font-bold text-white tracking-wider">{identityToken}</span>
      </SplitButtonSegment>
      <SplitButtonSegment
        className="px-1.5"
        onClick={onCopy}
        title="Copy Alt1 link"
      >
        {tokenCopied
          ? <Check className="w-3 h-3 text-green-400" />
          : <Copy className="w-3 h-3" />
        }
      </SplitButtonSegment>
    </SplitButton>
  );
}
