import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useApp, hasAnyDepartment } from "./state/AppStore";
import { AccessDenied, AppShell, HomeRedirect } from "./components/Layout";
import { SetupPage } from "./pages/Setup";
import { LoginPage } from "./pages/Login";
import { PublicCheckInPage } from "./pages/PublicCheckIn";
import { PublicBookingPage } from "./pages/PublicBooking";
import { AppointmentsPage } from "./pages/Appointments";
import { DashboardPage } from "./pages/Dashboard";
import { GatePage } from "./pages/Gate";
import { WorkshopPage } from "./pages/Workshop";
import { JobDetailPage } from "./pages/JobDetail";
import { StoresPage } from "./pages/Stores";
import { CashierPage } from "./pages/Cashier";
import { InsuranceDeskPage } from "./pages/InsuranceDesk";
import { AccountingPage } from "./pages/Accounting";
import { MarketingPage } from "./pages/Marketing";
import { HistoryPage } from "./pages/History";
import { TeamPage } from "./pages/Team";
import { SettingsPage } from "./pages/Settings";
import { LicenceLockPage } from "./pages/LicenceLock";
import { DeveloperPortalPage } from "./pages/DeveloperPortal";
import { StartOrderPage } from "./pages/StartOrder";
import { licenceInfo } from "./lib/licence";
import { featureFlagsFor } from "./lib/features";
import { cloudConfigured } from "./lib/supabase";
import type { Department, FeatureFlagKey } from "./types";

function ProtectedShell() {
  const { state, currentUser } = useApp();
  if (!state.settings.configured) return <Navigate to="/setup" replace />;
  if (!currentUser) return <Navigate to="/login" replace />;
  if (licenceInfo(state.settings).mode === "Expired") return <LicenceLockPage />;
  return <AppShell />;
}

function RequireDepartment({
  children,
  departments,
  ownerOnly,
}: {
  children: ReactNode;
  departments?: Department[];
  ownerOnly?: boolean;
}) {
  const { currentUser } = useApp();
  if (!currentUser) return <Navigate to="/login" replace />;
  if (ownerOnly && !currentUser.isOwner) return <AccessDenied />;
  if (departments && !hasAnyDepartment(currentUser, departments)) return <AccessDenied />;
  return <>{children}</>;
}

function RequireFeature({
  children,
  any,
}: {
  children: ReactNode;
  any: FeatureFlagKey[];
}) {
  const { state } = useApp();
  const flags = featureFlagsFor(state.settings);
  if (!any.some((key) => flags[key])) return <AccessDenied />;
  return <>{children}</>;
}

function PublicCheckInGate() {
  const { state } = useApp();
  if (!state.settings.configured && !cloudConfigured) return <Navigate to="/setup" replace />;
  return <PublicCheckInPage />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/check-in" element={<PublicCheckInGate />} />
      <Route path="/check-in/:slug" element={<PublicCheckInGate />} />
      <Route path="/book" element={<PublicBookingPage />} />
      <Route path="/book/:token" element={<PublicBookingPage />} />
      <Route path="/start" element={<StartOrderPage />} />
      <Route path="/developer" element={<DeveloperPortalPage />} />

      <Route element={<ProtectedShell />}>
        <Route index element={<HomeRedirect />} />
        <Route
          path="dashboard"
          element={
            <RequireDepartment ownerOnly>
              <DashboardPage />
            </RequireDepartment>
          }
        />
        <Route
          path="gate"
          element={
            <RequireDepartment departments={["PRO"]}>
              <GatePage />
            </RequireDepartment>
          }
        />
        <Route
          path="workshop"
          element={
            <RequireDepartment departments={["Supervisor"]}>
              <WorkshopPage />
            </RequireDepartment>
          }
        />
        <Route path="appointments" element={<AppointmentsPage />} />
        <Route path="jobs/:jobId" element={<JobDetailPage />} />
        <Route
          path="stores"
          element={
            <RequireDepartment departments={["Stores"]}>
              <StoresPage />
            </RequireDepartment>
          }
        />
        <Route
          path="cashier"
          element={
            <RequireDepartment departments={["Cashier"]}>
              <CashierPage />
            </RequireDepartment>
          }
        />
        <Route
          path="insurance-desk"
          element={
            <RequireDepartment
              departments={["Cashier", "Accounting", "Supervisor", "Stores"]}
            >
              <RequireFeature any={["enable_insurance_module"]}>
                <InsuranceDeskPage />
              </RequireFeature>
            </RequireDepartment>
          }
        />
        <Route
          path="accounting"
          element={
            <RequireDepartment departments={["Accounting"]}>
              <RequireFeature any={["enable_advanced_accounting", "enable_petty_cash"]}>
                <AccountingPage />
              </RequireFeature>
            </RequireDepartment>
          }
        />
        <Route
          path="marketing"
          element={
            <RequireDepartment departments={["PRO"]}>
              <MarketingPage />
            </RequireDepartment>
          }
        />
        <Route path="history" element={<HistoryPage />} />
        <Route
          path="team"
          element={
            <RequireDepartment ownerOnly>
              <TeamPage />
            </RequireDepartment>
          }
        />
        <Route
          path="settings"
          element={
            <RequireDepartment ownerOnly>
              <SettingsPage />
            </RequireDepartment>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
