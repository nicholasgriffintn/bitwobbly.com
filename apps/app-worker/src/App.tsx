import { Navigate, Route, Routes } from 'react-router-dom';

import { AuthProvider, useAuth } from './lib/auth';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Login from './routes/Login';
import Overview from './routes/Overview';
import Monitors from './routes/Monitors';
import StatusPages from './routes/StatusPages';
import Notifications from './routes/Notifications';
import Settings from './routes/Settings';

function AppShell() {
  return (
    <div className="shell">
      <Sidebar />
      <main className="content">
        <TopBar />
        <div className="content-body">
          <Routes>
            <Route path="/app" element={<Overview />} />
            <Route path="/app/monitors" element={<Monitors />} />
            <Route path="/app/status-pages" element={<StatusPages />} />
            <Route path="/app/notifications" element={<Notifications />} />
            <Route path="/app/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/app/*"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        />
        <Route path="/" element={<Navigate to="/app" replace />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </AuthProvider>
  );
}
