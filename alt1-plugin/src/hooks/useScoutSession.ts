import { useRef, useState, useEffect, useCallback } from 'react';
import { EctoSession, type SessionStatus } from '../session';
import type { ClientMessage } from '@shared/protocol';

export interface ScoutSessionState {
  status: SessionStatus;
  code: string | null;
  clientCount: number;
  error: string | null;
  inviteToken: string | null;
  memberName: string | null;
  memberRole: string | null;
}

export function useScoutSession() {
  const sessionRef = useRef<EctoSession>(null!);
  if (sessionRef.current === null) {
    sessionRef.current = new EctoSession();
  }
  const session = sessionRef.current;

  const [state, setState] = useState<ScoutSessionState>({
    status: session.status,
    code: session.code,
    clientCount: session.clientCount,
    error: session.error,
    inviteToken: session.inviteToken,
    memberName: session.memberName,
    memberRole: session.memberRole,
  });

  useEffect(() => {
    const unsubs = [
      session.on('statusChange', (status) => {
        setState((prev) => ({ ...prev, status }));
      }),
      session.on('codeChange', (code) => {
        setState((prev) => ({ ...prev, code }));
      }),
      session.on('clientCount', (count) => {
        setState((prev) => ({ ...prev, clientCount: count }));
      }),
      session.on('error', (error) => {
        setState((prev) => ({ ...prev, error }));
      }),
      session.on('identity', (memberName, memberRole) => {
        setState((prev) => ({ ...prev, memberName, memberRole, inviteToken: session.inviteToken }));
      }),
    ];

    // Auto-resume a prior session from localStorage
    session.resume();

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [session]);

  const joinSession = useCallback((code: string) => {
    return session.joinSession(code);
  }, [session]);

  const leaveSession = useCallback(() => {
    session.leaveSession();
    setState((prev) => ({ ...prev, inviteToken: null, memberName: null, memberRole: null }));
  }, [session]);

  const sendMutation = useCallback((msg: ClientMessage) => {
    session.sendMutation(msg);
  }, [session]);

  const dismissError = useCallback(() => {
    session.dismissError();
  }, [session]);

  const joinWithToken = useCallback((tokenOrUrl: string) => {
    const ok = session.joinWithToken(tokenOrUrl);
    if (ok) {
      setState((prev) => ({ ...prev, inviteToken: session.inviteToken }));
    }
    return ok;
  }, [session]);

  return {
    ...state,
    session,
    joinSession,
    leaveSession,
    sendMutation,
    dismissError,
    joinWithToken,
  };
}
