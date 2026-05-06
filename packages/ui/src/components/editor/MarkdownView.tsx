import { useMemo } from 'react';
import { marked } from 'marked';
import type { OpenTab } from '../../store';

export function MarkdownView({ tab }: { tab: OpenTab }) {
  const html = useMemo(() => {
    if (!tab.contents) return '';
    return marked.parse(tab.contents, { async: false }) as string;
  }, [tab.contents]);
  if (tab.loading) return <div className="p-3 text-editor-sm text-editor-text-muted">Loading…</div>;
  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div
        className="rsd-markdown mx-auto max-w-[820px]"
        // README content is server-side text from the user's own workspace; rendered into the dev's own VS Code.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
