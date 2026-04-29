import type { FlowGraph, FlowNode as FlowNodeType } from '../api';

interface FlowMapProps {
  flowGraph: FlowGraph | null;
  highlightedNodeId?: string | null;
  compact?: boolean;
}

export function FlowMap({ flowGraph, highlightedNodeId, compact = false }: FlowMapProps) {
  if (!flowGraph) {
    return (
      <div className="flex items-center justify-center h-48 text-rsd-muted text-sm">
        No flow graph available
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-0.5' : 'space-y-1'}>
      <FlowNodeRenderer
        graph={flowGraph}
        nodeId={flowGraph.rootNodeId}
        highlightedNodeId={highlightedNodeId || null}
        compact={compact}
        visited={new Set()}
        depth={0}
        isLast={true}
      />
    </div>
  );
}

interface FlowNodeRendererProps {
  graph: FlowGraph;
  nodeId: string;
  highlightedNodeId: string | null;
  compact: boolean;
  visited: Set<string>;
  depth: number;
  isLast: boolean;
}

function FlowNodeRenderer({
  graph,
  nodeId,
  highlightedNodeId,
  compact,
  visited,
  depth,
  isLast,
}: FlowNodeRendererProps) {
  if (visited.has(nodeId)) return null;
  visited.add(nodeId);

  const node = graph.nodes[nodeId];
  if (!node) return null;

  const isHighlighted = highlightedNodeId === nodeId;
  const isBranch = node.type === 'branch';
  const childIds = getChildIds(node);

  return (
    <div className="relative">
      {/* Vertical connector from parent */}
      {depth > 0 && (
        <div
          className="absolute left-4 -top-1 w-0.5 h-2 bg-rsd-border"
          style={{ marginLeft: depth * 20 - 20 }}
        />
      )}

      {/* Node card */}
      <div
        className={`
          relative flex items-start gap-2.5 rounded-lg border px-3
          ${compact ? 'py-1.5' : 'py-2.5'}
          ${isHighlighted
            ? 'border-rsd-accent/50 bg-rsd-accent/10 flow-node-active'
            : 'border-rsd-border/60 bg-rsd-bg/60 hover:border-rsd-border'
          }
          transition-colors
        `}
        style={{ marginLeft: depth * 20 }}
      >
        {/* Node icon */}
        <NodeIcon type={node.type} isHighlighted={isHighlighted} />

        {/* Node content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-medium truncate ${compact ? 'text-xs' : 'text-sm'} ${isHighlighted ? 'text-rsd-text' : 'text-rsd-text/90'}`}>
              {node.label}
            </span>
            {isHighlighted && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rsd-accent/20 text-rsd-accent font-medium shrink-0">
                HERE
              </span>
            )}
          </div>
          {isBranch && node.condition && !compact && (
            <p className="text-xs text-rsd-muted mt-0.5 truncate">
              {node.condition}
            </p>
          )}
        </div>
      </div>

      {/* Branch paths */}
      {isBranch && node.branchTrue && node.branchFalse && (
        <div
          className={`grid grid-cols-2 gap-2 ${compact ? 'mt-0.5' : 'mt-1'}`}
          style={{ marginLeft: depth * 20 + 20 }}
        >
          <BranchPath
            graph={graph}
            nodeId={node.branchTrue}
            label="Yes"
            taken={true}
            highlightedNodeId={highlightedNodeId}
            compact={compact}
            visited={visited}
            depth={depth + 1}
          />
          <BranchPath
            graph={graph}
            nodeId={node.branchFalse}
            label="No"
            taken={false}
            highlightedNodeId={highlightedNodeId}
            compact={compact}
            visited={visited}
            depth={depth + 1}
          />
        </div>
      )}

      {/* Regular children (non-branch) */}
      {!isBranch && childIds.length > 0 && (
        <div className={compact ? 'mt-0.5' : 'mt-1'}>
          {childIds.map((childId, i) => (
            <FlowNodeRenderer
              key={childId}
              graph={graph}
              nodeId={childId}
              highlightedNodeId={highlightedNodeId}
              compact={compact}
              visited={visited}
              depth={depth + 1}
              isLast={i === childIds.length - 1}
            />
          ))}
        </div>
      )}

      {/* Branch children that aren't true/false (follow-on after branch) */}
      {isBranch && getFollowOnChildren(node).length > 0 && (
        <div className={compact ? 'mt-0.5' : 'mt-1'}>
          {getFollowOnChildren(node).map((childId, i, arr) => (
            <FlowNodeRenderer
              key={childId}
              graph={graph}
              nodeId={childId}
              highlightedNodeId={highlightedNodeId}
              compact={compact}
              visited={visited}
              depth={depth + 1}
              isLast={i === arr.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BranchPath({
  graph,
  nodeId,
  label,
  taken,
  highlightedNodeId,
  compact,
  visited,
  depth,
}: {
  graph: FlowGraph;
  nodeId: string;
  label: string;
  taken: boolean;
  highlightedNodeId: string | null;
  compact: boolean;
  visited: Set<string>;
  depth: number;
}) {
  const node = graph.nodes[nodeId];

  return (
    <div className={`rounded-lg border px-2 py-1.5 ${taken ? 'border-rsd-branch/30 bg-rsd-branch/5' : 'border-rsd-border/40 bg-rsd-bg/30'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`text-[10px] font-bold uppercase ${taken ? 'text-rsd-branch' : 'text-rsd-muted'}`}>
          {taken ? '✓' : '○'} {label}
        </span>
      </div>
      {node && !visited.has(nodeId) && (
        <FlowNodeRenderer
          graph={graph}
          nodeId={nodeId}
          highlightedNodeId={highlightedNodeId}
          compact={compact}
          visited={visited}
          depth={0}
          isLast={true}
        />
      )}
    </div>
  );
}

function NodeIcon({ type, isHighlighted }: { type: string; isHighlighted: boolean }) {
  const config: Record<string, { symbol: string; color: string; activeColor: string }> = {
    entry: { symbol: '●', color: 'text-blue-400/70', activeColor: 'text-blue-400' },
    branch: { symbol: '◆', color: 'text-amber-400/70', activeColor: 'text-amber-400' },
    loop: { symbol: '↻', color: 'text-fuchsia-400/70', activeColor: 'text-fuchsia-400' },
    await: { symbol: '◇', color: 'text-violet-400/70', activeColor: 'text-violet-400' },
    return: { symbol: '●', color: 'text-green-400/70', activeColor: 'text-green-400' },
    throw: { symbol: '✕', color: 'text-red-400/70', activeColor: 'text-red-400' },
    'function-call': { symbol: '▶', color: 'text-cyan-400/70', activeColor: 'text-cyan-400' },
    'side-effect': { symbol: '◉', color: 'text-emerald-400/70', activeColor: 'text-emerald-400' },
  };

  const c = config[type] || { symbol: '○', color: 'text-gray-400/70', activeColor: 'text-gray-400' };

  return (
    <span className={`text-sm shrink-0 mt-0.5 ${isHighlighted ? c.activeColor : c.color}`}>
      {c.symbol}
    </span>
  );
}

function getChildIds(node: FlowNodeType): string[] {
  return Array.from(
    new Set(
      [...(node.children || []), node.branchTrue, node.branchFalse].filter(Boolean) as string[]
    )
  );
}

function getFollowOnChildren(node: FlowNodeType): string[] {
  const branchIds = new Set([node.branchTrue, node.branchFalse].filter(Boolean));
  return (node.children || []).filter((id) => !branchIds.has(id));
}
