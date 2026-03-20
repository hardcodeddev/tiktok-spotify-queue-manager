import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AdminPage from './pages/AdminPage.jsx';
import ViewerPage from './pages/ViewerPage.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/request" element={<ViewerPage />} />
        <Route path="*" element={<Navigate to="/request" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
