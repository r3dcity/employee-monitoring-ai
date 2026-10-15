import React, { useState, useEffect } from "react";
import {
  FiHome,
  FiEye,
  FiUsers,
  FiShield,
  FiMap,
  FiAlertTriangle,
  FiSettings,
  FiLogOut,
  FiMoreVertical,
  FiX,
  FiChevronLeft,
  FiChevronRight,
  FiVideo,
  FiSliders, // Import icon for rules
} from "react-icons/fi";
import Logo from "../../assets/logo/Logo_Vision.webp";
import { Link, useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useUser } from "../../context/UserContext";
import { useAlerts } from "../../services/queries";

const navItems = [
  {
    text: "Home",
    icon: <FiHome size={20} />,
    path: "/dashboard",
    allowedRoles: ["ADMIN", "SECURITY"],
  },
  {
    text: "Observer mode",
    icon: <FiEye size={20} />,
    path: "/observer",
    allowedRoles: ["ADMIN", "SECURITY"],
  },
  {
    text: "Employees",
    icon: <FiUsers size={20} />,
    path: "/employees",
    allowedRoles: ["ADMIN"],
  },
  {
    text: "Security Personnel",
    icon: <FiShield size={20} />,
    path: "/security",
    allowedRoles: ["ADMIN"],
  },
  {
    text: "Video Cameras",
    icon: <FiVideo size={20} />,
    path: "/video-cameras",
    allowedRoles: ["ADMIN", "SECURITY"],
  },
  {
    text: "Alerts",
    icon: <FiAlertTriangle size={20} />,
    path: "/alerts",
    allowedRoles: ["ADMIN", "SECURITY"],
  },
  {
    text: "Alert Rules",
    icon: <FiSliders size={20} />,
    path: "/alert-rules",
    allowedRoles: ["ADMIN"],
  }, // Add Alert Rules item
];

const Sidebar = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const { logout, user } = useUser(); // Get user object which should contain the role
  const location = useLocation(); // Get current location
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: activeAlerts = [] } = useAlerts({ status: "active" });

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        // Tailwind's 'md' breakpoint
        setIsOpen(false);
      } else {
        setIsOpen(true);
      }
    };

    handleResize();

    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleSidebar = () => setIsOpen(!isOpen);
  const toggleOptions = () => setIsOptionsOpen(!isOptionsOpen);

  const handleLogout = () => {
    setIsOptionsOpen(false);
    logout();
    // Do not show the previous user's data to the next one
    queryClient.clear();
    navigate("/login", { replace: true });
  };

  return (
    <>
      <aside
        className={`relative bg-neutral-800 text-white h-screen flex flex-col transition-width duration-300 ease-in-out ${
          isOpen ? "w-64" : "w-20"
        }`}
      >
        {/* Logo and Toggle Button */}
        <div
          className={`flex items-center p-4 ${
            isOpen ? "justify-between" : "justify-center"
          }`}
        >
          {isOpen && (
            <div className="flex items-center space-x-2">
              <img src={Logo} alt="logo" className="w-12 h-12" />
              <span className="font-serif text-4xl text-white">VISION</span>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className="text-white p-1 rounded hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
            aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {isOpen ? (
              <FiChevronLeft size={24} />
            ) : (
              <FiChevronRight size={24} />
            )}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-grow mt-4">
          <ul>
            {navItems.map((item) => {
              // Determine if the current user's role is allowed to see this item
              const userRoles = user?.roles || []; // Ensure userRoles is an array
              const isAllowed = userRoles.some((role) =>
                item.allowedRoles.includes(role)
              );
              const isActive = location.pathname === item.path; // Check if the current path matches the item's path

              // Render the item only if the user's role is allowed
              return isAllowed ? (
                <li key={item.text} className="mb-2">
                  <Link
                    to={item.path}
                    className={`flex items-center p-3 rounded-md mx-2 transition-colors duration-200 ${
                      isActive ? "bg-neutral-700" : "hover:bg-neutral-700"
                    } ${!isOpen ? "justify-center" : ""}`}
                  >
                    <span className="flex-shrink-0 relative">
                      {item.icon}
                      {item.path === "/alerts" && activeAlerts.length > 0 && (
                        <span
                          className="absolute -top-2 -right-3 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center"
                          title={`${activeAlerts.length} active alerts`}
                        >
                          {activeAlerts.length > 99 ? "99+" : activeAlerts.length}
                        </span>
                      )}
                    </span>
                    <span
                      className={`ml-3 transition-opacity duration-200 ${
                        isOpen
                          ? "opacity-100 whitespace-nowrap"
                          : "opacity-0 hidden"
                      }`}
                    >
                      {item.text}
                    </span>
                  </Link>
                </li>
              ) : null; // Don't render the item if the role is not allowed
            })}
          </ul>
        </nav>

        {/* Options Button Container - Added relative positioning */}
        <div className="relative p-2 border-t border-neutral-700">
          <button
            onClick={toggleOptions}
            className={`w-full flex items-center p-3 rounded-md hover:bg-neutral-700 transition-colors duration-200 cursor-pointer ${
              !isOpen ? "justify-center" : ""
            }`} // Added cursor-pointer
          >
            <span className="flex-shrink-0">
              <FiMoreVertical size={20} />
            </span>
            <span
              className={`ml-3 transition-opacity duration-200 ${
                isOpen ? "opacity-100 whitespace-nowrap" : "opacity-0 hidden"
              }`}
            >
              Options
            </span>
          </button>
          {/* Options Menu - Positioned absolutely */}
          {isOptionsOpen && (
            <div
              className={`absolute bottom-full left-2 mb-2 ${
                isOpen ? "w-56" : "w-48"
              } bg-neutral-700 rounded-lg shadow-xl z-50 p-2`} // Adjusted positioning and width
              onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
            >
              {/* Settings Link */}
              <Link
                to="/settings" // Added path for settings
                onClick={toggleOptions} // Close menu on click
                className="w-full flex items-center px-3 py-2 text-sm text-neutral-100 rounded hover:bg-neutral-600"
              >
                <FiSettings size={16} className="mr-2" />
                Settings
              </Link>
              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center px-3 py-2 mt-1 text-sm text-red-400 rounded hover:bg-neutral-600 cursor-pointer"
              >
                <FiLogOut size={16} className="mr-2" />
                Logout
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
