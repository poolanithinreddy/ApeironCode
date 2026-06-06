import {Box, Text} from 'ink';
import React from 'react';

import type {TaskPlan} from '../tasks/types.js';

const statusColor = (status: TaskPlan['status'] | TaskPlan['steps'][number]['status']) => {
  switch (status) {
    case 'completed':
      return 'green';
    case 'failed':
      return 'red';
    case 'running':
      return 'yellow';
    case 'paused':
      return 'magenta';
    default:
      return 'gray';
  }
};

const getProgress = (task: TaskPlan): string => {
  if (task.steps.length === 0) {
    return '0/0';
  }

  const completed = task.steps.filter((step) => step.status === 'completed' || step.status === 'skipped').length;
  return `${completed}/${task.steps.length}`;
};

interface TaskViewerProps {
  task?: TaskPlan;
  tasks?: TaskPlan[];
  title: string;
}

export const TaskViewer = ({task, tasks, title}: TaskViewerProps) => {
  const taskList = task ? [task] : tasks ?? [];

  return (
    <Box flexDirection="column" marginTop={1} borderStyle="round" borderColor="magenta" paddingX={1}>
      <Text color="magenta">{title}</Text>
      {task ? (
        <Box flexDirection="column">
          <Text>{task.id}</Text>
          <Text>{task.goal}</Text>
          <Text color={statusColor(task.status)}>
            {task.status} | {task.mode} | {getProgress(task)} complete
          </Text>
          <Text dimColor>Session: {task.linkedSessionId ?? 'none'}</Text>
          <Box marginTop={1} flexDirection="column">
            {task.steps.length > 0 ? task.steps.slice(0, 8).map((step) => (
              <Text key={step.id} color={statusColor(step.status)}>
                [{step.status}] {step.title}
              </Text>
            )) : <Text dimColor>No steps recorded.</Text>}
          </Box>
        </Box>
      ) : taskList.length > 0 ? (
        <Box flexDirection="column">
          {taskList.slice(0, 8).map((entry) => (
            <Text key={entry.id} color={statusColor(entry.status)}>
              {entry.id} | {entry.status} | {getProgress(entry)} | {entry.goal}
            </Text>
          ))}
        </Box>
      ) : (
        <Text dimColor>No task plans found.</Text>
      )}
    </Box>
  );
};