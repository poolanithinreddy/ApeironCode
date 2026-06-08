export interface SignalCleanup {
  dispose: () => void;
}

type ProcessSignal = 'SIGINT' | 'SIGTERM';

export const installSignalHandlers = (onSignal: (signal: ProcessSignal) => void): SignalCleanup => {
  const handler = (signal: ProcessSignal) => {
    onSignal(signal);
  };
  process.once('SIGINT', handler);
  process.once('SIGTERM', handler);

  return {
    dispose: () => {
      process.off('SIGINT', handler);
      process.off('SIGTERM', handler);
    },
  };
};
