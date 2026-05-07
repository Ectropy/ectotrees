import { useState } from 'react';
import { CircleQuestionMark, CircleX } from 'lucide-react';

export function NotConnectedPrompt() {
  const [learnMore, setLearnMore] = useState(false);
  const dashboardUrl = `${window.location.origin}/`;

  return (
    <div className="px-3 py-4 flex flex-col gap-3">
      <p className="text-sm text-muted-foreground text-center">
        To start scouting,<br />
        <a
          href={dashboardUrl}
          target="_blank"
          rel="noreferrer"
          className="text-foreground underline underline-offset-2"
        >
          connect to Ectotrees
        </a>
        .
      </p>

      <div className={`flex flex-col gap-3 rounded p-3 border ${learnMore ? 'border-cyan-400-a50' : 'border-transparent'}`}>
        <button
          onClick={() => setLearnMore(v => !v)}
          className="mx-auto flex items-center text-muted-foreground"
        >
          {learnMore ? <CircleX size={14} /> : <CircleQuestionMark size={14} />}
        </button>
        {learnMore && (
          <p className="text-xs text-muted-foreground">
            From the Ectotrees dashboard, find the cyan box containing your 12-digit{' '}
            <span className="text-foreground">identity code</span>{' '}
            then copy and paste it into the input above.<br/><br/>
            No code yet? Click the{' '}
            <span className="text-foreground">Link with Alt1</span>{' '}
            button or join a managed session to generate an identity code.
          </p>
        )}
      </div>
    </div>
  );
}
