'use client';

import { useEffect } from 'react';
import { useAuth } from '@/components/auth-provider';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { UserMenu } from '@/components/user-menu';
import Image from 'next/image';

const publicPaths = ['/login', '/register', '/auth/callback'];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();

  // Force reload when restored from bfcache (e.g. back from Stripe checkout)
  useEffect(() => {
    function handlePageShow(e: PageTransitionEvent) {
      if (e.persisted) {
        window.location.reload();
      }
    }
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  const isPublicPath = publicPaths.some(p => pathname.startsWith(p));

  // For public paths (login, register), render without shell
  if (isPublicPath || !user) {
    return <>{children}</>;
  }

  // For authenticated paths, render with sidebar and header
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-white sticky top-0 z-50">
        <div className="container mx-auto px-4 h-18 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <a href="/" className="flex items-center gap-2">
              <Image src="/logo.png" alt="Invoica" width={432} height={115} className="h-[67px] w-auto" priority />
            </a>
          </div>
          <div className="flex items-center gap-4">
            <a href="https://docs.invoica.ai" className="text-sm text-slate-500 hover:text-slate-900 transition-colors hidden md:inline">Docs</a>
            <UserMenu />
          </div>
        </div>
      </header>
      <div className="flex-1 flex">
        <Sidebar />
        <main className="flex-1 ml-16 md:ml-56 p-6">{children}</main>
      </div>
      <footer className="border-t bg-white py-6 ml-16 md:ml-56">
        <div className="px-6 flex flex-col items-center gap-3">
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-1 text-xs text-slate-400">
            <a href="https://invoica.ai/terms" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 transition-colors">Terms of Service</a>
            <span className="select-none">·</span>
            <a href="https://invoica.ai/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 transition-colors">Privacy Policy</a>
            <span className="select-none">·</span>
            <a href="https://invoica.ai/acceptable-use" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 transition-colors">Acceptable Use</a>
            <span className="select-none">·</span>
            <a href="https://invoica.ai/cookies" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 transition-colors">Cookie Policy</a>
            <span className="select-none">·</span>
            <a href="https://status.invoica.ai" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 transition-colors">Status</a>
            <span className="select-none">·</span>
            <a href="https://docs.invoica.ai" target="_blank" rel="noopener noreferrer" className="hover:text-slate-600 transition-colors">Docs</a>
          </div>
          <p className="text-xs text-slate-400">&copy; {new Date().getFullYear()} Invoica. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
