import { Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import AppHeader from '../components/AppHeader';
import AuthGuard from '../components/AuthGuard';
import { useAuth } from '../auth/AuthProvider';
import { useCredits } from '../hooks/useCredits';
import { useSubscription } from '../hooks/useSubscription';

export default function AppLayout() {
  const { user, signOut } = useAuth();
  const { balance: creditsBalance, loading: creditsLoading } = useCredits(user?.id);
  const { plan } = useSubscription(user?.id);

  return (
    <AuthGuard>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#e2e8f0',
            border: '1px solid #334155',
          },
        }}
      />
      <div className="min-h-screen w-full overflow-x-hidden bg-slate-900 font-sans text-slate-300">
        <AppHeader
          creditsBalance={creditsBalance}
          creditsLoading={creditsLoading}
          plan={plan}
          onSignOut={() => void signOut()}
        />
        <Outlet />
      </div>
    </AuthGuard>
  );
}
