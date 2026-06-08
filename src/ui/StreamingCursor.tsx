import {Text} from 'ink';
import React, {useEffect, useState} from 'react';

interface StreamingCursorProps {
  isVisible: boolean;
}

export const StreamingCursor = ({isVisible}: StreamingCursorProps) => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % 2);
    }, 500);

    return () => {
      clearInterval(interval);
    };
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  return <Text color="cyan">{frame === 0 ? '▊' : ' '}</Text>;
};
