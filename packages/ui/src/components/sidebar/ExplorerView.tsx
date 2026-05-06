import { useMemo, useState } from 'react';
import type { FileTreeNode } from '../../api';
import { openFileTab } from '../../controller';
import { useAppStore } from '../../store';

interface NodeProps {
  node: FileTreeNode;
  depth: number;
  findingCounts: Map<string, { todo: number; fixme: number; other: number }>;
  entryPointFiles: Set<string>;
}

function Node({ node, depth, findingCounts, entryPointFiles }: NodeProps) {
  const [open, setOpen] = useState(depth < 1);
  const counts = findingCounts.get(node.path);
  const hasEntry = node.type === 'file' && entryPointFiles.has(node.path);

  if (node.type === 'directory') {
    const visible = node.children ?? [];
    return (
      <div>
        <div
          className="flex cursor-pointer select-none items-center gap-1 px-2 py-0.5 text-editor-sm text-editor-text hover:bg-editor-list-hover"
          style={{ paddingLeft: depth * 12 + 8 }}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="w-3 text-editor-text-muted">{open ? '▾' : '▸'}</span>
          <span className="truncate">{node.name}</span>
        </div>
        {open && visible.map((c) => (
          <Node
            key={c.path}
            node={c}
            depth={depth + 1}
            findingCounts={findingCounts}
            entryPointFiles={entryPointFiles}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="group flex cursor-pointer select-none items-center gap-2 px-2 py-0.5 text-editor-sm text-editor-text hover:bg-editor-list-hover"
      style={{ paddingLeft: depth * 12 + 24 }}
      onClick={() => void openFileTab(node.path)}
      title={node.path}
    >
      <span className="truncate">{node.name}</span>
      <div className="ml-auto flex items-center gap-1.5 pr-1 text-editor-xs">
        {hasEntry && <span className="text-editor-good" title="Has entry point">▶</span>}
        {counts && counts.todo > 0 && <span className="text-deco-todo" title={`${counts.todo} TODO`}>{counts.todo}T</span>}
        {counts && counts.fixme > 0 && <span className="text-deco-fixme" title={`${counts.fixme} FIXME`}>{counts.fixme}!</span>}
      </div>
    </div>
  );
}

export function ExplorerView() {
  const tree = useAppStore((s) => s.fileTree);
  const findings = useAppStore((s) => s.findings);
  const eps = useAppStore((s) => s.workspace?.entryPoints ?? []);

  const findingCounts = useMemo(() => {
    const map = new Map<string, { todo: number; fixme: number; other: number }>();
    for (const f of findings) {
      const segments = f.file.split('/');
      // attribute counts to file and every parent directory
      for (let i = 0; i < segments.length; i++) {
        const key = segments.slice(0, i + 1).join('/');
        const cur = map.get(key) || { todo: 0, fixme: 0, other: 0 };
        if (f.kind === 'todo') cur.todo++;
        else if (f.kind === 'fixme') cur.fixme++;
        else cur.other++;
        map.set(key, cur);
      }
    }
    return map;
  }, [findings]);

  const entryPointFiles = useMemo(() => new Set(eps.map((e) => e.file)), [eps]);

  if (!tree) {
    return <div className="px-4 py-2 text-editor-xs text-editor-text-muted">Loading file tree…</div>;
  }
  return (
    <div className="h-full overflow-y-auto py-1">
      {(tree.children ?? []).map((c) => (
        <Node key={c.path} node={c} depth={0} findingCounts={findingCounts} entryPointFiles={entryPointFiles} />
      ))}
    </div>
  );
}
