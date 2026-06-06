import type {LinearClient} from './client.js';
import type {LinearProject} from './types.js';

const PROJECT_FIELDS = `
  id
  name
  description
  slugId
  state
  url
`;

interface RawLinearProject {
  description?: string | null;
  id: string;
  name: string;
  slugId?: string;
  state?: string;
  url?: string;
}

const mapProject = (project: RawLinearProject): LinearProject => ({
  description: project.description ?? null,
  id: project.id,
  name: project.name,
  slugId: project.slugId,
  state: project.state,
  url: project.url,
});

export const listLinearProjects = async (client: LinearClient): Promise<LinearProject[]> => {
  const query = `
    query Projects {
      projects(first: 50) {
        nodes { ${PROJECT_FIELDS} }
      }
    }
  `;
  const data = await client.request<{projects: {nodes: RawLinearProject[]}}>(query);
  return data.projects.nodes.map(mapProject);
};

export const getLinearProject = async (client: LinearClient, id: string): Promise<LinearProject> => {
  const query = `
    query Project($id: String!) {
      project(id: $id) { ${PROJECT_FIELDS} }
    }
  `;
  const data = await client.request<{project: RawLinearProject}>(query, {id});
  return mapProject(data.project);
};
