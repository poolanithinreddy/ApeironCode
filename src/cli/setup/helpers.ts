import type {CliHandlers} from '../commands.js';
import {createAgentsHandlers} from './agentsHandlers.js';
import {createContextHandlers} from './contextHandlers.js';
import {createCoreHandlers} from './coreHandlers.js';
import {createGithubHandlers} from './githubHandlers.js';
import {createLspHandlers} from './lspHandlers.js';
import {createMemoryHandlers} from './memoryHandlers.js';
import {createProvidersHandlers} from './providersHandlers.js';
import type {BootstrapRuntimeContext} from './runtimeContext.js';
import {createRuntimeHandlers} from './runtimeHandlers.js';
import {createSessionsHandlers} from './sessionsHandlers.js';
import {createSkillsHandlers} from './skillsHandlers.js';
import {createWorkflowHandlers} from './workflowHandlers.js';
import {createBgTaskHandlers} from './bgTaskHandlers.js';
import {createBridgeHandlers} from './bridgeHandlers.js';
import {createProjectBrainHandlers} from './projectBrainHandlers.js';

export const createBootstrapHandlers = (context: BootstrapRuntimeContext): CliHandlers => {
  return {
    ...createCoreHandlers(context),
    ...createSessionsHandlers(context),
    ...createContextHandlers(context),
    ...createMemoryHandlers(context),
    ...createSkillsHandlers(context),
    ...createProvidersHandlers(context),
    ...createGithubHandlers(context),
    ...createAgentsHandlers(context),
    ...createLspHandlers(context),
    ...createRuntimeHandlers(context),
    ...createWorkflowHandlers(context),
    ...createBgTaskHandlers(context),
    ...createBridgeHandlers(context),
    ...createProjectBrainHandlers(context),
  } as CliHandlers;
};
