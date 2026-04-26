'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, roleHome } from '@/lib/auth';
import type { User } from '@/types';
import type { Role } from '@/lib/auth';
import Spinner from '@/components/ui/Spinner';

interface AuthGuardProps {
  role: Role;
  children: (user: User) => React.ReactNode;
}

/**
 * Validates the server-side cookie by calling GET /api/auth/me.
 * - If unauthenticated  → redirect to /login
 * - If wrong role       → redirect to the correct dashboard
 * - If authenticated    → render children with the user object
 */
export default function AuthGuard({ role, children }: AuthGuardProps) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    getSession().then(u => {
      if (!u) {
        router.replace('/login');
      } else if (u.role !== role) {
        router.replace(roleHome(u.role as Role));
      } else {
        setUser(u);
        setChecking(false);
      }
    });
  }, [role, router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-slate-400 text-sm">Verifying session…</p>
        </div>
      </div>
    );
  }

  return <>{user && children(user)}</>;
}
