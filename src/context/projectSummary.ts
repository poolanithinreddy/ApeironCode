import type {ProjectScan} from './scanner.js';

export const buildProjectSummary = (scan: ProjectScan): string => {
  const lines = [
    `Project: ${scan.projectName}`,
    `Languages: ${scan.languages.join(', ') || 'unknown'}`,
    `Frameworks: ${scan.frameworks.join(', ') || 'none detected'}`,
    `Package manager: ${scan.packageManager ?? 'unknown'}`,
    `Source directories: ${scan.sourceDirectories.join(', ') || 'none detected'}`,
    `Config files: ${scan.configFiles.join(', ') || 'none detected'}`,
    `Entrypoints: ${scan.entrypoints.join(', ') || 'none detected'}`,
    `Test command: ${scan.testCommand ?? 'none detected'}`,
    `Lint command: ${scan.lintCommand ?? 'none detected'}`,
    `Build command: ${scan.buildCommand ?? 'none detected'}`,
  ];

  if (scan.git.isRepo) {
    lines.push(
      `Git: branch ${scan.git.branch ?? 'detached'}, ${scan.git.changedFiles} changed file(s)`,
    );
  }

  return lines.join('\n');
};