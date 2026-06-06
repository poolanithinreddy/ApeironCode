import {suites} from './suites/index.js';
import type {EvalDefinition} from './types.js';

const titleFor = (id: string): string =>
  id.split('-').map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(' ');

export const evalDefinitions: EvalDefinition[] = suites.map((suite) => ({
  description: suite.description,
  id: suite.id,
  title: titleFor(suite.id),
}));

export const getEvalDefinition = (id: string): EvalDefinition | undefined =>
  evalDefinitions.find((definition) => definition.id === id);
