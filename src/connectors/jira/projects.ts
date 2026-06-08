import type {JiraClient} from './client.js';
import type {JiraProject} from './types.js';

interface RawJiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey?: string;
  self?: string;
}

const mapProject = (project: RawJiraProject, baseUrl: string): JiraProject => ({
  id: project.id,
  key: project.key,
  name: project.name,
  projectTypeKey: project.projectTypeKey,
  url: `${baseUrl}/browse/${project.key}`,
});

export const listJiraProjects = async (client: JiraClient): Promise<JiraProject[]> => {
  const data = await client.request<{values?: RawJiraProject[]} | RawJiraProject[]>('/rest/api/3/project/search', {
    query: {maxResults: 50},
  });
  const projects = Array.isArray(data) ? data : (data.values ?? []);
  return projects.map((project) => mapProject(project, client.baseUrl));
};

export const getJiraProject = async (client: JiraClient, idOrKey: string): Promise<JiraProject> => {
  const project = await client.request<RawJiraProject>(`/rest/api/3/project/${encodeURIComponent(idOrKey)}`);
  return mapProject(project, client.baseUrl);
};
