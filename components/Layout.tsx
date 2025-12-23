
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  stepName: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, stepName }) => {
  return (
    <div className="flex flex-col min-h-screen w-full max-w-5xl mx-auto p-6 md:p-10 select-none overflow-y-auto">
      <header className="flex justify-between items-center mb-8 shrink-0">
        <span className="text-sm md:text-base font-black uppercase tracking-[0.2em] text-slate-400 bg-slate-100 px-4 py-2 rounded-xl">
          {stepName}
        </span>
      </header>
      <main className="flex-1 flex flex-col justify-center items-center">
        {children}
      </main>
      <footer className="mt-12 mb-4 text-center text-slate-400 text-base md:text-lg font-medium italic shrink-0 relative">
        <div className="absolute inset-0 z-0 opacity-0 cursor-default" aria-hidden="true" />
        <span className="relative z-10">Music Study 2025 • Anonymous Feedback</span>
      </footer>
    </div>
  );
};
