// Pages
import LoginPage from "./pages/LoginPage.jsx";
import HomePage from "./pages/HomePage.jsx";
import AboutPage from "./pages/AboutPage.jsx";

import "./style/main.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { LoginRequiredComponent } from "./components/protected/LoginRequired.jsx";
import { AdminRoleRequired } from "./components/protected/AdminRoleRequired.jsx";
import { useUser } from "./context/UserContext.jsx";
import { LoadingComponent } from "./components/LoadingComponent.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import { AlreadyAuthenticated } from "./components/protected/AlreadyAuthenticated.jsx";
import EmployeeRegistration from "./pages/employees/EmployeeRegistration.jsx";
import EmployeeEdit from "./pages/employees/EmployeeEdit.jsx";
import EmployeesList from "./pages/employees/EmployeesList.jsx";
import SecurityRegistration from "./pages/security/SecurityRegistration.jsx";
import SecurityList from "./pages/security/SecurityList.jsx";
import ObserverPage from "./pages/ObserverPage.jsx";
import AlertsPage from "./pages/alerts/AlertsPage.jsx";
import IndividualAlertPage from "./pages/alerts/IndividualAlertPage.jsx";
import VideoCamerasPage from "./pages/video-cameras/VideoCamerasPage.jsx";
import VideoCamerasRegisterPage from "./pages/video-cameras/VideoCamerasRegisterPage.jsx";
import IndividualVideoCameraPage from "./pages/video-cameras/IndividualVideoCameraPage.jsx";
import SettingsPage from "./pages/settings/SettingsPage.jsx";
import SecurityInvitation from "./pages/security/SecurityInvitation.jsx";
import AlertRulesPage from "./pages/rules/AlertRulesPage.jsx";
import AlertRuleCreatePage from "./pages/rules/AlertRuleCreatePage.jsx";
import AppLayout from "./components/layout/AppLayout.jsx";

export const App = () => {
  const { isAuthenticated, loading, isAdmin } = useUser();

  if (loading) {
    return (
      <div
        style={{
          backgroundColor: "#2C2C2C",
          backgroundSize: "cover",
          backgroundPosition: "center",
          width: "100vw",
          height: "100vh",
        }}
        className="flex items-center justify-center h-screen relative"
      >
        <LoadingComponent />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="*"
          element={<NotFoundPage />}
        />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/security/register" element={<SecurityRegistration />} />

        <Route
          element={<AlreadyAuthenticated isAuthenticated={isAuthenticated()} />}
        >
          <Route path="/login" element={<LoginPage />} />
        </Route>
        <Route
          element={
            <LoginRequiredComponent isAuthenticated={isAuthenticated()} />
          }
        >
          <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<HomePage />} />

          <Route element={<AdminRoleRequired isAdmin={isAdmin()} />}>
            <Route
              path="/employees/register"
              element={<EmployeeRegistration />}
            />
            <Route
              path="/employees/:employeeId/edit"
              element={<EmployeeEdit />}
            />
            <Route path="/employees" element={<EmployeesList />} />

            <Route path="/security" element={<SecurityList />} />
            <Route
              path="/security/invitation"
              element={<SecurityInvitation />}
            />
          </Route>

          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/alerts/:alertId" element={<IndividualAlertPage />} />

          <Route path="/video-cameras" element={<VideoCamerasPage />} />
          <Route
            path="/video-cameras/register"
            element={<VideoCamerasRegisterPage />}
          />
          <Route
            path="/video-cameras/:cameraId"
            element={<IndividualVideoCameraPage />}
          />

          <Route path="/settings" element={<SettingsPage />} />

          <Route element={<AdminRoleRequired isAdmin={isAdmin()} />}>
            <Route path="/alert-rules" element={<AlertRulesPage />} />
            <Route
              path="/alert-rules/create"
              element={<AlertRuleCreatePage />}
            />
          </Route>

          <Route path="/observer" element={<ObserverPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
};
