import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
import { Toaster } from 'react-hot-toast'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
      <Toaster
        position="top-right"
        containerStyle={{ top: 76, right: 18 }}
        toastOptions={{
          duration: 3500,
          className: 'app-toast',
          style: {
            background: 'rgba(10, 14, 27, 0.72)',
            color: 'rgba(231, 234, 243, 0.92)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '14px',
            padding: '0.75rem 0.85rem',
            boxShadow: '0 18px 50px rgba(0, 0, 0, 0.35)',
            backdropFilter: 'blur(14px)',
          },
          success: {
            iconTheme: {
              primary: 'rgba(110, 231, 183, 1)',
              secondary: '#070a12',
            },
          },
          error: {
            iconTheme: {
              primary: 'rgba(244, 114, 182, 1)',
              secondary: '#070a12',
            },
          },
        }}
      />
    </BrowserRouter>
  </StrictMode>,
)
