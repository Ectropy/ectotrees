import { useRef, useState, useEffect, useCallback } from 'react';
import { EctoSession, type SessionStatus } from '../session';
import type { ClientMessage } from '@shared/protocol';

export interface ScoutSessionState {
  status: SessionStatus;
  code: string | null;
  clientCount: number;
  error: string | null;
  isPaired: boolean;
  pairId: string | null;
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
    isPaired: session.isPaired,
    pairId: session.pairId,
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
      session.on('paired', (pairId) => {
        setState((prev) => ({ ...prev, isPaired: true, pairId }));
      }),
      session.on('unpaired', () => {
        setState((prev) => ({ ...prev, isPaired: false }));
      }),
    ];

    // Auto-resume a prior session from localStorage
    session.resume();

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, [session]);

  const createSession = useCallback(async () => {
    return session.createSession();
  }, [session]);

  const joinSession = useCallback((code: string) => {
    return session.joinSession(code);
  }, [session]);

  const leaveSession = useCallback(() => {
    session.leaveSession();
  }, [session]);

  const sendMutation = useCallback((msg: ClientMessage) => {
    session.sendMutation(msg);
  }, [session]);

  const dismissError = useCallback(() => {
    session.dismissError();
  }, [session]);

  const submitPairToken = useCallback((token: string) => {
    session.submitPairToken(token);
  }, [session]);

  const unpair = useCallback(() => {
    session.unpair();
  }, [session]);

  return {
    ...state,
    session,
    createSession,
    joinSession,
    leaveSession,
    sendMutation,
    dismissError,
    submitPairToken,
    unpair,
  };
}
