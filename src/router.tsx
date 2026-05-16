import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/LoginPage';

function DashboardPlaceholder() {
  return <div className="p-8 text-slate-300">Dashboard — coming in Task 6</div>;
}
function ProjectPlaceholder() {
  return <div className="p-8 text-slate-300">Project Workspace — coming in Task 7</div>;
}
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
      { path: 'dashboard', element: <DashboardPlaceholder /> },
      { path: 'project/:projectId', element: <ProjectPlaceholder /> },
      { path: 'settings', element: <SettingsPlaceholder /> },
    ],
  },
]);
