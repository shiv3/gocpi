import React from 'react'
import { createRoot } from 'react-dom/client'

function App() {
  return (
    <main>
      <h1>gocpi pricing simulator</h1>
    </main>
  )
}

const root = document.getElementById('root')

if (!root) {
  throw new Error('missing root element')
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
