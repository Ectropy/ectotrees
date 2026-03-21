import { useRef, useState, useEffect, useCallback } from 'react';
import { EctoSession, type SessionStatus } from '../session';
import type { ClientMessage } from '@shared/protocol';

export interface ScoutSessionState {
  status: SessionStatus;
  code: string | null;
  inviteToken: string | null;
  error: string | null;
  memberName: string | null;
  memberRole: string | null;
  reconnectAttempt: number;
  reconnectAt: number | null;
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
    inviteToken: session.inviteToken,
    error: session.error,
    memberName: session.memberName,
    memberRole: session.memberRole,
    reconnectAttempt: session.reconnectAttempt,
    reconnectAt: session.reconnectAt,
  });

  useEffect(() => {
    const unsubs = [
      session.on('statusChange', (status) => {
        setState((prev) => ({ ...prev, status, inviteToken: session.inviteToken, reconnectAttempt: session.reconnectAttempt, reconnectAt: session.reconnectAt }));
      }),
      session.on('reconnectChange', (reconnectAttempt, reconnectAt) => {
        setState((prev) => ({ ...prev, reconnectAttempt, reconnectAt }));
      }),
      session.on('codeChange', (code) => {
        setState((prev) => ({ ...prev, code }));
      }),
      session.on('error', (error) => {
        setState((prev) => ({ ...prev, error }));
      }),
      session.on('identity', (memberName, memberRole) => {
        setState((prev) => ({ ...prev, memberName, memberRole }));
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
    setState((prev) => ({ ...prev, memberName: null, memberRole: null, inviteToken: null }));
  }, [session]);

  const sendMutation = useCallback((msg: ClientMessage) => {
    session.sendMutation(msg);
  }, [session]);

  const dismissError = useCallback(() => {
    session.dismissError();
  }, [session]);

  const joinWithToken = useCallback((tokenOrUrl: string) => {
    return session.joinWithToken(tokenOrUrl);
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
