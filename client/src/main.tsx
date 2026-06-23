import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import TeacherDashboard from './pages/TeacherDashboard'
import SchoolWideView from './pages/SchoolWideView'
import VideoDashboard from './pages/VideoDashboard'
import VerifyEmail from './pages/VerifyEmail'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/teacher" element={<TeacherDashboard />} />
        <Route path="/teacher/videos" element={<VideoDashboard />} />
        <Route path="/school-wide" element={<SchoolWideView />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
