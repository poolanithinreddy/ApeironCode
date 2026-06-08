import type {DoctorCheck} from '../diagnostics/doctor.js';
import {type ConnectorId, validateConnectorEnv} from './envValidation.js';

export const buildConnectorDoctorChecks = (): DoctorCheck[] => {
  return (['github', 'linear', 'jira', 'slack'] satisfies ConnectorId[]).map((connectorId) => {
    const validation = validateConnectorEnv(connectorId);
    return {
      detail: validation.configured
        ? `Configured: ${validation.requirements.map((requirement) => requirement.name).join(', ')}`
        : `Missing: ${validation.missing.join(', ')}`,
      fix: validation.configured ? undefined : validation.setupHint,
      label: `${connectorId} connector`,
      status: validation.configured ? 'pass' : 'warn',
    };
  });
};
