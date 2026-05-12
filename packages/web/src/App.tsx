import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import LobbyScreen from './screens/LobbyScreen';
import RoomScreen from './screens/RoomScreen';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/register" element={<RegisterScreen />} />
        <Route
          path="/lobby"
          element={
            <ProtectedRoute>
              <LobbyScreen />
            </ProtectedRoute>
          }
        />
        <Route
          path="/room/:roomId"
          element={
            <ProtectedRoute>
              <RoomScreen />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/lobby" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
