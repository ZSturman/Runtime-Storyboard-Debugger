import { useState, useEffect } from 'react';
import type { SourceSnippet } from '../api';
import { fetchSource } from '../api';

interface SourceViewProps {
  file: string;
  line: number;
}

export function SourceView({ file, line }: SourceViewProps) {
  const [source, setSource] = useState<SourceSnippet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSource(null);
    setError(null);
    fetchSource(file, line, 12)
      .then(setSource)
      .catch((err) => setError(err.message));
  }, [file, line]);

  if (error) {
    return (
      <div className="text-xs text-rsd-muted p-3">
        Could not load source: {error}
      </div>
    );
  }

  if (!source) {
    return (
      <div className="p-3">
        <div className="animate-pulse space-y-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-3 bg-rsd-border rounded" style={{ width: `${40 + Math.random() * 50}%` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-rsd-bg rounded-lg border border-rsd-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-rsd-border/30">
        <span className="text-xs text-rsd-muted font-mono">{source.file}</span>
        <span className="text-xs text-rsd-muted">
          Lines {source.startLine}–{source.endLine}
        </span>
      </div>
      <pre className="text-xs font-mono leading-5 overflow-x-auto">
        {source.lines.map((sourceLine) => (
          <div
            key={sourceLine.number}
            className={`px-3 ${sourceLine.highlighted ? 'source-line-highlight' : ''}`}
          >
            <span className="inline-block w-8 text-right text-rsd-muted/40 mr-4 select-none">
              {sourceLine.number}
            </span>
            <span className={sourceLine.highlighted ? 'text-white' : 'text-rsd-text/80'}>
              {sourceLine.content || ' '}
            </span>
          </div>
        ))}
      </pre>
    </div>
  );
}
