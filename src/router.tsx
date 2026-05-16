import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProjectWorkspace from './pages/ProjectWorkspace';

function SettingsPlaceholder() {
  return <div className="p-8 text-slate-300">Settings — coming in Task 10</div>;
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'project/:projectId', element: <ProjectWorkspace /> },
      { path: 'settings', element: <SettingsPlaceholder /> },
    ],
  },
]);
