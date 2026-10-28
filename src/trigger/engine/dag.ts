import type { GraphNode, GraphEdge, DAG } from "./types"

/**
 * Build a directed acyclic graph from nodes and edges.
 *
 * Returns:
 *  - `adj`      : adjacency list  (nodeId → [childId, ...])
 *  - `inDegree` : in-degree count (nodeId → number of parents)
 *
 * The caller uses this to do topological (BFS) traversal.
 */
export function buildDAG(nodes: GraphNode[], edges: GraphEdge[]): DAG {
  const adj: DAG["adj"] = {}
  const inDegree: DAG["inDegree"] = {}

  for (const node of nodes) {
    adj[node.id] = []
    inDegree[node.id] = 0
  }

  for (const edge of edges) {
    if (!(edge.source in adj) || !(edge.target in inDegree)) continue
    adj[edge.source].push(edge.target)
    inDegree[edge.target]++
  }

  return { adj, inDegree }
}

/**
 * Return the IDs of all root nodes (zero incoming edges).
 */
export function findRootNodes(inDegree: DAG["inDegree"]): string[] {
  return Object.keys(inDegree).filter((id) => inDegree[id] === 0)
}
