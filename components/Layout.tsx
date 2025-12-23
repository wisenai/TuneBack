
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  stepName: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, stepName }) => {
  return (
    <div className="flex flex-col min-h-screen w-full max-w-4xl mx-auto p-6 md:p-10 select-none">
      <header className="flex justify-between items-center mb-8 shrink-0">
        <span className="text-base font-black uppercase tracking-[0.2em] text-slate-400">
          Music Feedback • {stepName}
        </span>
      </header>
      <main className="flex-1 flex flex-col justify-center items-center py-4">
        {children}
      </main>
      <footer className="mt-12 mb-4 text-center text-slate-400 text-lg font-medium italic shrink-0">
        Anonymized response • {new Date().toLocaleDateString()}
      </footer>
    </div>
  );
};
