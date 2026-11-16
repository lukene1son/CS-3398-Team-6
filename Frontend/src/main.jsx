import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installSmoothWheel } from './smoothScroll'

// Eased mouse-wheel scrolling on every page and scrollable box (smoothScroll.js).
installSmoothWheel()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
