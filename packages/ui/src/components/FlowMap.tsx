import { useMemo, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
  type NodeProps,
  Handle,
  Position,
  useReactFlow,
  ReactFlowProvider,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import type { FlowGraph, FlowNode as FlowNodeType } from '../api';

interface FlowMapProps {
  flowGraph: FlowGraph | null;
  highlightedNodeId?: string | null;
  /** Visual scale; kept for back-compat with prior FlowMap API. */
  compact?: boolean;
  /** Called when the user clicks a node. */
  onNodeClick?: (nodeId: string) => void;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 64;

interface NodePalette {
  symbol: string;
  border: string;
  bg: string;
  borderActive: string;
  bgActive: string;
  symbolColor: string;
}

const PALETTE: Record<string, NodePalette> = {
  entry: {
    symbol: '●',
    border: 'border-blue-400/40',
    bg: 'bg-blue-400/10',
    borderActive: 'border-blue-300',
    bgActive: 'bg-blue-400/25',
    symbolColor: 'text-blue-300',
  },
  branch: {
    symbol: '◆',
    border: 'border-amber-400/40',
    bg: 'bg-amber-400/10',
    borderActive: 'border-amber-300',
    bgActive: 'bg-amber-400/25',
    symbolColor: 'text-amber-300',
  },
  loop: {
    symbol: '↻',
    border: 'border-fuchsia-400/40',
    bg: 'bg-fuchsia-400/10',
    borderActive: 'border-fuchsia-300',
    bgActive: 'bg-fuchsia-400/25',
    symbolColor: 'text-fuchsia-300',
  },
  await: {
    symbol: '◇',
    border: 'border-violet-400/40',
    bg: 'bg-violet-400/10',
    borderActive: 'border-violet-300',
    bgActive: 'bg-violet-400/25',
    symbolColor: 'text-violet-300',
  },
  return: {
    symbol: '●',
    border: 'border-emerald-400/40',
    bg: 'bg-emerald-400/10',
    borderActive: 'border-emerald-300',
    bgActive: 'bg-emerald-400/25',
    symbolColor: 'text-emerald-300',
  },
  throw: {
    symbol: '✕',
    border: 'border-red-400/40',
    bg: 'bg-red-400/10',
    borderActive: 'border-red-300',
    bgActive: 'bg-red-400/25',
    symbolColor: 'text-red-300',
  },
  'function-call': {
    symbol: '▶',
    border: 'border-cyan-400/40',
    bg: 'bg-cyan-400/10',
    borderActive: 'border-cyan-300',
    bgActive: 'bg-cyan-400/25',
    symbolColor: 'text-cyan-300',
  },
  'side-effect': {
    symbol: '◉',
    border: 'border-teal-400/40',
    bg: 'bg-teal-400/10',
    borderActive: 'border-teal-300',
    bgActive: 'bg-teal-400/25',
    symbolColor: 'text-teal-300',
  },
};

const FALLBACK_PALETTE: NodePalette = {
  symbol: '○',
  border: 'border-rsd-border',
  bg: 'bg-rsd-bg/60',
  borderActive: 'border-rsd-accent',
  bgActive: 'bg-rsd-accent/20',
  symbolColor: 'text-rsd-muted',
};

interface FlowNodeData {
  label: string;
  type: string;
  condition?: string;
  isHighlighted: boolean;
}

function FlowNodeCard({ data }: NodeProps<FlowNodeData>) {
  const palette = PALETTE[data.type] || FALLBACK_PALETTE;
  return (
    <div
      className={`relative flex items-start gap-2 rounded-2xl border px-3 py-2 transition-colors ${
        data.isHighlighted ? `${palette.borderActive} ${palette.bgActive} flow-node-active` : `${palette.border} ${palette.bg}`
      }`}
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
    >
      <Handle type="target" position={Position.Top} className="!bg-rsd-border !border-0 !w-2 !h-2" />
      <span className={`mt-0.5 shrink-0 text-sm ${palette.symbolColor}`}>{palette.symbol}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-rsd-muted">{data.type}</span>
          {data.isHighlighted && (
            <span className="rounded-full bg-rsd-accent/25 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-rsd-accent">
              here
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs font-medium text-rsd-text">{data.label}</div>
        {data.condition && <div className="mt-0.5 truncate text-[10px] text-rsd-muted">{data.condition}</div>}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-rsd-border !border-0 !w-2 !h-2" />
    </div>
  );
}

const NODE_TYPES = { rsd: FlowNodeCard };

interface BuiltGraph {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
}

function buildGraph(flowGraph: FlowGraph, highlightedNodeId: string | null): BuiltGraph {
  const dag = new dagre.graphlib.Graph();
  dag.setDefaultEdgeLabel(() => ({}));
  dag.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 50, marginx: 16, marginy: 16 });

  const visited = new Set<string>();
  const queue: string[] = [flowGraph.rootNodeId];
  const reachable: FlowNodeType[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    const node = flowGraph.nodes[id];
    if (!node) continue;
    visited.add(id);
    reachable.push(node);
    for (const childId of node.children || []) queue.push(childId);
    if (node.branchTrue) queue.push(node.branchTrue);
    if (node.branchFalse) queue.push(node.branchFalse);
  }

  for (const node of reachable) {
    dag.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  const edges: Edge[] = [];
  const seenEdgeIds = new Set<string>();
  const addEdge = (edge: Edge) => {
    if (seenEdgeIds.has(edge.id)) return;
    seenEdgeIds.add(edge.id);
    edges.push(edge);
  };

  for (const node of reachable) {
    if (node.type === 'branch' && (node.branchTrue || node.branchFalse)) {
      if (node.branchTrue) {
        dag.setEdge(node.id, node.branchTrue);
        addEdge({
          id: `${node.id}->${node.branchTrue}:true`,
          source: node.id,
          target: node.branchTrue,
          label: 'yes',
          labelStyle: { fill: '#fbbf24', fontSize: 10, fontWeight: 600 },
          labelBgStyle: { fill: '#1c1d26' },
          labelBgPadding: [4, 2],
          style: { stroke: '#fbbf24', strokeWidth: 1.5 },
        });
      }
      if (node.branchFalse) {
        dag.setEdge(node.id, node.branchFalse);
        addEdge({
          id: `${node.id}->${node.branchFalse}:false`,
          source: node.id,
          target: node.branchFalse,
          label: 'no',
          labelStyle: { fill: '#94a3b8', fontSize: 10, fontWeight: 600 },
          labelBgStyle: { fill: '#1c1d26' },
          labelBgPadding: [4, 2],
          style: { stroke: '#475569', strokeWidth: 1.25, strokeDasharray: '4 3' },
        });
      }
      const branchSet = new Set([node.branchTrue, node.branchFalse].filter(Boolean) as string[]);
      for (const childId of node.children || []) {
        if (branchSet.has(childId)) continue;
        dag.setEdge(node.id, childId);
        addEdge({
          id: `${node.id}->${childId}`,
          source: node.id,
          target: childId,
          style: { stroke: '#475569', strokeWidth: 1.25 },
        });
      }
    } else {
      for (const childId of node.children || []) {
        dag.setEdge(node.id, childId);
        addEdge({
          id: `${node.id}->${childId}`,
          source: node.id,
          target: childId,
          style: { stroke: '#475569', strokeWidth: 1.25 },
        });
      }
    }
  }

  dagre.layout(dag);

  const nodes: Node<FlowNodeData>[] = reachable.map((node) => {
    const positioned = dag.node(node.id);
    return {
      id: node.id,
      type: 'rsd',
      position: { x: positioned.x - NODE_WIDTH / 2, y: positioned.y - NODE_HEIGHT / 2 },
      data: {
        label: node.label,
        type: node.type,
        condition: node.condition,
        isHighlighted: node.id === highlightedNodeId,
      },
      draggable: false,
      selectable: true,
    };
  });

  return { nodes, edges };
}

function FlowMapInner({ flowGraph, highlightedNodeId, onNodeClick }: FlowMapProps) {
  const { nodes, edges } = useMemo(
    () => (flowGraph ? buildGraph(flowGraph, highlightedNodeId || null) : { nodes: [], edges: [] }),
    [flowGraph, highlightedNodeId],
  );

  const reactFlow = useReactFlow();

  // When the highlighted node changes, gently center on it.
  useEffect(() => {
    if (!highlightedNodeId || nodes.length === 0) return;
    const target = nodes.find((n) => n.id === highlightedNodeId);
    if (!target) return;
    reactFlow.setCenter(target.position.x + NODE_WIDTH / 2, target.position.y + NODE_HEIGHT / 2, {
      zoom: 1,
      duration: 350,
    });
  }, [highlightedNodeId, nodes, reactFlow]);

  if (!flowGraph) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-rsd-border bg-rsd-bg/40 text-sm text-rsd-muted">
        No flow graph available
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-rsd-border bg-rsd-bg/40 text-sm text-rsd-muted">
        Flow graph is empty
      </div>
    );
  }

  return (
    <div className="rsd-flow-map relative h-[460px] overflow-hidden rounded-2xl border border-rsd-border bg-rsd-bg/40">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={onNodeClick ? (_, node) => onNodeClick(node.id) : undefined}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.1 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={!!onNodeClick}
        zoomOnDoubleClick={false}
      >
        <Background gap={18} size={1} color="#262936" />
        <Controls
          position="bottom-right"
          showInteractive={false}
          className="!rounded-xl !border !border-rsd-border !bg-rsd-bg/80 !shadow-none"
        />
        <MiniMap
          pannable
          zoomable
          className="!rounded-xl !border !border-rsd-border !bg-rsd-bg/80"
          maskColor="rgba(15,17,23,0.7)"
          nodeColor={(n) => ((n.data as FlowNodeData)?.isHighlighted ? '#7dd3fc' : '#475569')}
        />
      </ReactFlow>
    </div>
  );
}

export function FlowMap(props: FlowMapProps) {
  return (
    <ReactFlowProvider>
      <FlowMapInner {...props} />
    </ReactFlowProvider>
  );
}
