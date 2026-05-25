import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import CreateTest from './pages/CreateTest';
import TestDetail from './pages/TestDetail';
import TakeTest from './pages/TakeTest';
import Results from './pages/Results';
import EditTest from './pages/EditTest';
import Admin from './pages/Admin';
import Compare from './pages/Compare';
import VerifyEmail from './pages/VerifyEmail';
import NotFound from './pages/NotFound';

function PrivateRoute({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }: { children: JSX.Element }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/tests/:id" element={<TestDetail />} />
          <Route path="/tests/:id/take" element={<PrivateRoute><TakeTest /></PrivateRoute>} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/tests/:id/results/:resultId" element={<Results />} />
          <Route
            path="/create"
            element={
              <PrivateRoute>
                <CreateTest />
              </PrivateRoute>
            }
          />
          <Route
            path="/tests/:id/edit"
            element={
              <PrivateRoute>
                <EditTest />
              </PrivateRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <Admin />
              </AdminRoute>
            }
          />
          <Route
            path="/compare"
            element={
              <PrivateRoute>
                <Compare />
              </PrivateRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
