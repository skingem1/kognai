'use client';

import { useAuth } from '@/components/auth-provider';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

const publicPaths = ['/login', '/register', '/auth/callback'];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const isPublicPath = publicPaths.some(p => pathname.startsWith(p));

  useEffect(() => {
    if (!loading && !user && !isPublicPath) {
      router.push('/login');
    }
    if (!loading && user && isPublicPath && pathname !== '/auth/callback') {
      router.push('/');
    }
  }, [user, loading, isPublicPath, router, pathname]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#635BFF] mx-auto" />
          <p className="mt-4 text-sm text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  // Public paths get rendered without the dashboard shell
  if (isPublicPath) {
    return <>{children}</>;
  }

  if (!user) return null;

  return <>{children}</>;
}
