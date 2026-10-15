import { Outlet } from "react-router";
import Sidebar from "./Sidebar";
import AlertToasts from "../notification/AlertToasts";
import { useLiveInvalidation } from "../../services/queries";

/**
 * Shell of every logged-in page. The sidebar is rendered once here (it used to be rendered by
 * each page, so it re-mounted and lost its collapsed state on every navigation).
 */
const AppLayout = () => {
  useLiveInvalidation();
  return (
    <div className="flex h-screen bg-neutral-900 text-white">
      <Sidebar />
      <div className="flex-1 min-w-0 overflow-hidden">
        <Outlet />
      </div>
      <AlertToasts />
    </div>
  );
};

export default AppLayout;
