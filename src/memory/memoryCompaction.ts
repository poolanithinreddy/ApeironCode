import type {MemoryGraph} from './graphTypes.js';

export const compactMemoryGraph = (graph: MemoryGraph, maxObservationsPerEntity = 5): MemoryGraph => ({
  ...graph,
  entities: graph.entities.map((entity) => ({
    ...entity,
    observations: entity.observations.slice(-maxObservationsPerEntity),
  })),
  updatedAt: new Date().toISOString(),
});
