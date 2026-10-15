import { createRoot } from "react-dom/client";
import "./style/main.css";
import { UserProvider } from "./context/UserContext.jsx";
import { App } from "./App.jsx";
import { AppDataProvider } from "./context/AppDataContext.jsx";
import { LiveEventsProvider } from "./context/LiveEventsContext.jsx";

createRoot(document.getElementById("root")).render(
  <UserProvider>
    <LiveEventsProvider>
      <AppDataProvider>
        <App />
      </AppDataProvider>
    </LiveEventsProvider>
  </UserProvider>
);
