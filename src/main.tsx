import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import undipLogo from "./assets/logo-undip.png?inline"
import App from "./RootApp"
import "./index.css"
import "./enhancements.css"
const favicon = document.createElement("link")
favicon.rel = "icon"
favicon.type = "image/png"
favicon.href = undipLogo
document.head.appendChild(favicon)


createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
)
