import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { getCurrentUserFn } from '@/server/functions/auth';
import { getUserTeamsFn } from '@/server/functions/teams';
import Sidebar from '@/components/Sidebar';
import TopBar from '@/components/TopBar';

export const Route = createFileRoute('/app')({
  beforeLoad: async () => {
    const user = await getCurrentUserFn();
    if (!user) {
      throw new Error('Not authenticated');
    }
    if (!user.currentTeamId) {
      throw redirect({ to: '/onboarding' });
    }
    const teams = await getUserTeamsFn();
    return { user, teams };
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <div className="shell">
      <Sidebar />
      <main className="content">
        <TopBar />
        <div className="content-body">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
