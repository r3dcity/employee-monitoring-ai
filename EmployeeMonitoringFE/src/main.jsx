import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "./style/main.css";
import { UserProvider } from "./context/UserContext.jsx";
import { App } from "./App.jsx";
import { LiveEventsProvider } from "./context/LiveEventsContext.jsx";
import { queryClient } from "./services/queries.js";

createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={queryClient}>
    <UserProvider>
      <LiveEventsProvider>
        <App />
      </LiveEventsProvider>
    </UserProvider>
  </QueryClientProvider>
);
