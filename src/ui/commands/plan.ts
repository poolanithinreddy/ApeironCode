import type {SlashCommandDefinition} from './shared.js';
import {formatSlashMissingTaskMessage, resolveSlashTask} from './helpers.js';
import {formatTaskPlanList, formatTaskPlanSummary} from '../../tasks/taskSummary.js';
import {TaskStore} from '../../tasks/taskStore.js';

export const createPlanCommands = (): SlashCommandDefinition[] => [
{
    description: 'Inspect persistent task plans',
    name: '/plan',
    usage: '/plan [show|list|status|pause|resume|delete|clear|create|approve] [arguments]',
    async run(args, context) {
      const taskStore = new TaskStore(context.cwd);
      const [subcommand] = args;
      const taskId = args.slice(1).join(' ').trim() || undefined;

      switch (subcommand) {
        case 'create': {
          if (!taskId) {
            context.appendLocalAssistantMessage('Usage: /plan create <goal>');
            return;
          }

          const {PlanApprovalService} = await import('../../agent/planApprovalService.js');
          const {scanProject} = await import('../../context/scanner.js');
          const {rankRelevantFiles} = await import('../../agent/relevance.js');

          const projectScan = await scanProject(context.cwd);
          const config = context.getResolvedConfig();
          const relevantFiles = await rankRelevantFiles({
            config: config.effective,
            cwd: context.cwd,
            projectScan,
            prompt: taskId,
          });

          const planService = new PlanApprovalService(context.cwd);
          const plan = await planService.createPlan(
            taskId,
            'plan',
            projectScan,
            relevantFiles.map(f => f.path),
          );

          context.appendLocalAssistantMessage(`${planService.formatPlan(plan)}\n\n✓ Plan created: ${plan.id}\nRun '/plan approve ${plan.id}' to approve and execute.`);
          return;
        }
        case 'approve': {
          if (!taskId) {
            context.appendLocalAssistantMessage('Usage: /plan approve <planId>');
            return;
          }

          const {PlanApprovalService} = await import('../../agent/planApprovalService.js');
          const planService = new PlanApprovalService(context.cwd);

          const plan = await planService.approvePlan(taskId, 'user');
          if (!plan) {
            context.appendLocalAssistantMessage(`Plan ${taskId} not found.`);
            return;
          }

          context.appendLocalAssistantMessage(`${planService.formatPlan(plan)}\n\n✓ Plan approved: ${plan.id}`);
          return;
        }
        case 'execute': {
          if (!taskId) {
            context.appendLocalAssistantMessage('Usage: /plan execute <planId>');
            return;
          }

          const {PlanApprovalService} = await import('../../agent/planApprovalService.js');
          const planService = new PlanApprovalService(context.cwd);

          const plan = await planService.loadPlan(taskId);
          if (!plan) {
            context.appendLocalAssistantMessage(`Plan ${taskId} not found.`);
            return;
          }

          if (plan.status !== 'approved') {
            context.appendLocalAssistantMessage(`Plan ${taskId} has status "${plan.status}" but must be "approved" to execute.`);
            return;
          }

          context.appendLocalAssistantMessage(`Executing plan ${plan.id}: ${plan.goal}...`);
          await context.runPrompt(plan.goal, plan.mode);
          return;
        }
        case 'revise': {
          if (!taskId) {
            context.appendLocalAssistantMessage('Usage: /plan revise <planId> <instructions>');
            return;
          }

          const instructions = args.slice(2).join(' ').trim();
          if (!instructions) {
            context.appendLocalAssistantMessage('Usage: /plan revise <planId> <instructions>');
            return;
          }

          const {PlanApprovalService} = await import('../../agent/planApprovalService.js');
          const planService = new PlanApprovalService(context.cwd);

          const plan = await planService.loadPlan(taskId);
          if (!plan) {
            context.appendLocalAssistantMessage(`Plan ${taskId} not found.`);
            return;
          }

          if (plan.status !== 'draft') {
            context.appendLocalAssistantMessage(`Cannot revise plan ${taskId} with status "${plan.status}". Only draft plans can be revised.`);
            return;
          }

          plan.rationale = `${plan.rationale}\n\nRevision: ${instructions}`;
          plan.approvedAt = undefined;
          plan.approvedBy = undefined;
          await planService.savePlan(plan);

          context.appendLocalAssistantMessage(`${planService.formatPlan(plan)}\n\n✓ Plan revised: ${plan.id}\nRun '/plan approve ${plan.id}' to re-approve.`);
          return;
        }
        case 'clear': {
          const cleared = await taskStore.clear();
          context.setDashboard(null);
          context.appendLocalAssistantMessage(`Cleared ${cleared} task plan(s).`);
          return;
        }
        case 'list': {
          const tasks = await taskStore.list();
          context.setDashboard({tasks, title: 'Task Plans', type: 'task-list'});
          context.appendLocalAssistantMessage(formatTaskPlanList(tasks));
          return;
        }
        case 'pause': {
          if (!taskId) {
            context.appendLocalAssistantMessage('Usage: /plan pause <taskId>');
            return;
          }

          const task = await taskStore.load(taskId);
          if (!task) {
            context.appendLocalAssistantMessage(formatSlashMissingTaskMessage(taskId));
            return;
          }

          if (task.status === 'completed') {
            context.appendLocalAssistantMessage(`Task ${task.id} is already completed and cannot be paused.`);
            return;
          }

          const updated = task.status === 'paused' ? task : (await taskStore.setStatus(task.id, 'paused')) ?? task;
          context.setDashboard({task: updated, title: `Task ${updated.id}`, type: 'task-detail'});
          context.setStatus(`Task paused: ${updated.id.slice(0, 8)}`);
          context.appendLocalAssistantMessage(formatTaskPlanSummary(updated));
          return;
        }
        case 'resume': {
          if (!taskId) {
            context.appendLocalAssistantMessage('Usage: /plan resume <taskId>');
            return;
          }

          const task = await taskStore.load(taskId);
          if (!task) {
            context.appendLocalAssistantMessage(formatSlashMissingTaskMessage(taskId));
            return;
          }

          if (task.status === 'completed') {
            context.appendLocalAssistantMessage(`Task ${task.id} is already completed and cannot be resumed.`);
            return;
          }

          const updated = task.status === 'running' ? task : (await taskStore.setStatus(task.id, 'running')) ?? task;
          context.setDashboard({task: updated, title: `Task ${updated.id}`, type: 'task-detail'});
          context.setStatus(`Task running: ${updated.id.slice(0, 8)}`);
          context.appendLocalAssistantMessage(formatTaskPlanSummary(updated));
          return;
        }
        case 'delete': {
          if (!taskId) {
            context.appendLocalAssistantMessage('Usage: /plan delete <taskId>');
            return;
          }

          const deleted = await taskStore.delete(taskId);
          if (deleted) {
            context.setDashboard(null);
          }
          context.appendLocalAssistantMessage(deleted ? `Deleted task plan ${taskId}.` : formatSlashMissingTaskMessage(taskId));
          return;
        }
        case 'status': {
          const task = await resolveSlashTask(taskStore, taskId, 'latest-incomplete');
          if (task) {
            context.setDashboard({task, title: `Task ${task.id}`, type: 'task-detail'});
          }
          context.appendLocalAssistantMessage(task ? formatTaskPlanSummary(task) : formatSlashMissingTaskMessage(taskId, true));
          return;
        }
        case 'show':
        case undefined: {
          const requestedTaskId = subcommand === 'show' ? taskId : undefined;
          const task = await resolveSlashTask(taskStore, requestedTaskId);
          if (task) {
            context.setDashboard({task, title: `Task ${task.id}`, type: 'task-detail'});
          }
          context.appendLocalAssistantMessage(task ? formatTaskPlanSummary(task) : formatSlashMissingTaskMessage(requestedTaskId));
          return;
        }
        default:
          context.appendLocalAssistantMessage('Usage: /plan [show|list|status|pause|resume|delete|clear|create|approve|execute|revise] [arguments]');
      }
    },
  },
];
