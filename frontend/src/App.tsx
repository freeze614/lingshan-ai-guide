import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import './App.css';

import HomePage from './pages/visitor/HomePage';
import QAPage from './pages/visitor/QAPage';
import RecommendPage from './pages/visitor/RecommendPage';
import AdminLoginPage from './pages/admin/LoginPage';
import DashboardPage from './pages/admin/DashboardPage';
import KnowledgeBasePage from './pages/admin/KnowledgeBasePage';
import DigitalHumanPage from './pages/admin/DigitalHumanPage';
import SentimentReportPage from './pages/admin/SentimentReportPage';

/** Redirect unauthenticated users to admin login. */
function AdminGuard({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('admin_token');
  const location = useLocation();
  if (!token) {
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#c41d7f',
          borderRadius: 8,
          fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif",
        },
      }}
    >
      <BrowserRouter>
        <Routes>
          {/* Visitor */}
          <Route path="/" element={<HomePage />} />
          <Route path="/qa" element={<QAPage />} />
          <Route path="/recommend" element={<RecommendPage />} />

          {/* Admin — protected by auth guard */}
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin/dashboard" element={<AdminGuard><DashboardPage /></AdminGuard>} />
          <Route path="/admin/knowledge" element={<AdminGuard><KnowledgeBasePage /></AdminGuard>} />
          <Route path="/admin/digital-human" element={<AdminGuard><DigitalHumanPage /></AdminGuard>} />
          <Route path="/admin/reports" element={<AdminGuard><SentimentReportPage /></AdminGuard>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}

export default App;
