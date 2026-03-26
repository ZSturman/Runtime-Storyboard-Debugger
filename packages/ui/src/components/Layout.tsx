import type { ReactNode } from 'react';

interface LayoutProps {
  sidebar: ReactNode;
  main: ReactNode;
  detail: ReactNode;
}

export function Layout({ sidebar, main, detail }: LayoutProps) {
  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="h-12 bg-rsd-surface border-b border-rsd-border flex items-center px-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-rsd-accent" />
          <span className="font-semibold text-sm tracking-wide">RSD</span>
          <span className="text-rsd-muted text-xs">Runtime Storyboard Debugger</span>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 bg-rsd-surface border-r border-rsd-border overflow-y-auto shrink-0">
          {sidebar}
        </aside>

        {/* Main content — storyboard timeline */}
        <main className="flex-1 overflow-y-auto">
          {main}
        </main>

        {/* Detail panel (right) */}
        {detail && (
          <aside className="w-96 bg-rsd-surface border-l border-rsd-border overflow-y-auto shrink-0">
            {detail}
          </aside>
        )}
      </div>
    </div>
  );
}
