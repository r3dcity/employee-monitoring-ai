import React, { useState, useEffect } from "react";
import { Link } from "react-router"; // Updated import
import Sidebar from "../components/layout/Sidebar";
import {
  FiAlertTriangle,
  FiVideo,
  FiUsers,
  FiShield,
  FiEye,
  FiArrowRightCircle,
} from "react-icons/fi";
import {
  getAlerts,
  getCamerasList,
  getAllEmployees,
  getAllSecurity,
} from "../services/MainService";
import { useUser } from "../context/UserContext";
import { Bar, Line } from 'react-chartjs-2'; // Importing BarChart from react-chartjs-2
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { useAppData } from "../context/AppDataContext";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);
// Helper to format timestamp
const formatTimestamp = (isoString) => {
  if (!isoString) return "N/A";
  try {
    return new Date(isoString).toLocaleString();
  } catch {
    return isoString; // Return original if parsing fails
  }
};

// Updated DashboardCard to match StatCard structure from AlertsPage
const DashboardCard = ({
  icon,
  title,
  value,
  bgColor = "bg-neutral-800",
  iconBgColor = "bg-neutral-700",
}) => (
  <div className={`${bgColor} p-5 rounded-lg shadow-md mb-4`}>

    <div className="flex items-center mb-2">
      <div className={`${iconBgColor} p-3 rounded-md mr-4`}>
        {icon}
      </div>
      <div className="flex-1">
        <span className="text-lg block">{title}</span>
        <div className="text-2xl font-bold">{value}</div>
      </div>
    </div>
  </div>
);

const HomePage = () => {
  const [unresolvedAlerts, setUnresolvedAlerts] = useState(0);
  const [cameraCounts, setCameraCounts] = useState({ active: 0, inactive: 0 });
  const [employeeCount, setEmployeeCount] = useState(0);
  const [securityCount, setSecurityCount] = useState(0);
  const [latestAlerts, setLatestAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isAdmin } = useUser();
  const {alerts, cameras, loadAllAppData } = useAppData();

    const createAlertsTrendChart = () => {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const recentAlerts = alerts.filter(alert => {
            if (!alert.timestamp) return false;
            try {
            const alertDate = new Date(alert.timestamp);
            return alertDate >= sevenDaysAgo;
            } catch {
            console.warn("Invalid date format for alert:", alert);
            return false;
            }
        });

        const labels = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const day = date.getDate();
            const month = date.getMonth() + 1; // getMonth() is 0-indexed
            labels.unshift(`${day}/${month}`); // Add to the beginning to have the oldest date first
        }

        const dataCounts = labels.map(label => {
            const [day, month] = label.split('/').map(Number);
            return recentAlerts.filter(alert => {
            if (!alert.timestamp) return false;
            try {
                const alertDate = new Date(alert.timestamp);
                return alertDate.getDate() === day && (alertDate.getMonth() + 1) === month;
            } catch {
                return false;
            }
            }).length;
        });

        const data = {
            labels: labels,
            datasets: [
            {
                label: 'Alerts count per day',
                data: dataCounts,
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 4,

                tension: 0.4
            },
            ],
        };

        const options = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
            y: {
                beginAtZero: true,
                ticks: {
                color: '#e0e0e0', // Light grey for tick labels
                stepSize: 1, // Ensure integer steps for counts
                },
                grid: {
                color: 'rgba(224, 224, 224, 0.2)', // Lighter grid lines
                },
            },
            x: {
                ticks: {
                color: '#e0e0e0', // Light grey for tick labels
                },
                grid: {
                color: 'rgba(224, 224, 224, 0.2)', // Lighter grid lines
                },
            },
            },
            plugins: {
            legend: {
                labels: {
                color: '#e0e0e0', // Light grey for legend text
                },
            },
            tooltip: {
                titleColor: '#ffffff',
                bodyColor: '#ffffff',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
            }
            },
        };


        return (
            <div className="bg-neutral-800 px-6 pt-6 pb-12 rounded-lg shadow-md mb-8 w-1/2" style={{ height: '400px' }}> {/* Added w-1/2 for half width */}
              <h2 className="text-xl font-semibold mb-4 px-4 text-white">Alerts Trend (Last 7 Days)</h2>
              <Line data={data}  options={options}/>
            </div>
          );
        }

    const createMostActiveCamsChart = () => {
        let cameraToNoAlerts = {}
        for (let i = 0; i < alerts.length; i++) {
            if(alerts[i].camera_id) {
                if (cameraToNoAlerts[alerts[i].camera_id]) {
                    cameraToNoAlerts[alerts[i].camera_id] += 1;
                } else {
                    cameraToNoAlerts[alerts[i].camera_id] = 1;
                }
            }
        }

        const cameraNames = cameras.reduce((acc, cam) => {
            acc[cam.id] = cam.name || `Camera #${cam.id}`; // Default name if not available
            return acc;
        }, {});

        const labels = Object.keys(cameraToNoAlerts).map(camId => cameraNames[camId] || `Camera #${camId}`);
        const dataCounts = Object.values(cameraToNoAlerts);

        const data = {
            labels: labels,
            datasets: [
            {
                label: 'No. of alerts per camera',
                data: dataCounts,
                backgroundColor: 'rgba(255, 99, 132, 0.5)',
                borderColor: 'rgba(255, 99, 132, 1)',
                borderWidth: 1,
            },
            ],
        };

        const options = {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
            y: {
                beginAtZero: true,
                ticks: {
                color: '#e0e0e0', // Light grey for tick labels
                stepSize: 1, // Ensure integer steps for counts
                },
                grid: {
                color: 'rgba(224, 224, 224, 0.2)', // Lighter grid lines
                },
            },
            x: {
                ticks: {
                color: '#e0e0e0', // Light grey for tick labels
                },
                grid: {
                color: 'rgba(224, 224, 224, 0.2)', // Lighter grid lines
                },
            },
            },
            plugins: {
            legend: {
                labels: {
                color: '#e0e0e0', // Light grey for legend text
                },
            },
            tooltip: {
                titleColor: '#ffffff',
                bodyColor: '#ffffff',
                backgroundColor: 'rgba(0, 0, 0, 0.7)',
            }
            },
        };

        return (
            <div className="bg-neutral-800 px-6 pt-6 pb-12 rounded-lg shadow-md mb-8 w-1/2" style={{ height: '400px' }}>
              <h2 className="text-xl font-semibold mb-4 px-4 text-white">Most Active Cameras</h2>
              <Bar data={data}  options={options}/>
            </div>
          );
    }


  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError(null); // Reset error on new load
      try {
        const alertsResponse = await getAlerts();
        let alerts = alertsResponse.data.alerts;
        setUnresolvedAlerts(alerts.filter((alert) => alert.status === "active").length);
        setLatestAlerts(alerts.slice(0, 5));

        const camerasResponse = await getCamerasList();
        const cams = camerasResponse.data.cameras || [];
        const activeCams = cams.filter((cam) => cam.status === "active").length;
        const inactiveCams = cams.length - activeCams;
        setCameraCounts({ active: activeCams, inactive: inactiveCams });

        let employeesResponse = null;
        let securityResponse = null;
        if (isAdmin()) {
             employeesResponse = await getAllEmployees();
          setEmployeeCount(employeesResponse.data.length || 0);
          securityResponse = await getAllSecurity();
          setSecurityCount(securityResponse.data.length || 0);
        }
         else {
          employeesResponse = { data: [] };
          securityResponse = { data: [] };
          setEmployeeCount(0);
          setSecurityCount(0);
        }
        loadAllAppData(cams, alerts, employeesResponse.data, securityResponse.data);
      } catch (err) {
        console.error("Failed to fetch dashboard data:", err);
        setError("Failed to load dashboard data. Please try again later.");
        // Set default/empty states on error?
        setUnresolvedAlerts(0);
        setCameraCounts({ active: 0, inactive: 0 });
        setEmployeeCount(0);
        setSecurityCount(0);
        setLatestAlerts([]);
        loadAllAppData([], [], [], []);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const formatLocation = (alert) => {
    if (alert.camera_name && alert.zone_name) {
      return `${alert.camera_name} / ${alert.zone_name}`;
    } else if (alert.camera_name) {
      return `${alert.camera_name}${
        alert.camera_location ? ` (${alert.camera_location})` : ""
      }`;
    } else if (alert.zone_name) {
      return `Zone: ${alert.zone_name}`;
    } else if (alert.camera_id) {
      return `Camera #${alert.camera_id}`;
    } else if (alert.zone_id) {
      return `Zone #${alert.zone_id}`;
    } else {
      return "N/A";
    }
  };

  return (
    <div className="flex h-screen bg-neutral-900 text-white">
      <Sidebar />
      <main className="flex-1 p-6 md:p-8 lg:p-10 md:pt-6 lg:pt-6 overflow-auto">
        <h1 className="text-3xl font-semibold mb-8">Dashboard Overview</h1>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-xl text-neutral-400">
              Loading dashboard data...
            </div>
            {/* Optional: Add a spinner here */}
          </div>
        ) : error ? (
          <div
            className="bg-red-800 border border-red-600 text-red-100 px-4 py-3 rounded relative mb-6"
            role="alert"
          >
            <strong className="font-bold">Error:</strong>
            <span className="block sm:inline"> {error}</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
              <DashboardCard
                icon={<FiAlertTriangle className="h-6 w-6 text-white" />} // Added icon size/color for consistency
                title="Unresolved Alerts"
                value={unresolvedAlerts}
                bgColor="bg-red-900" // Adjusted colors to match AlertsPage examples
                iconBgColor="bg-red-700"
              />
              <DashboardCard
                icon={<FiVideo className="h-6 w-6 text-white" />}
                title="Camera Status"
                value={
                  <div className="text-xl text-left">

                    {/* Adjusted text size slightly */}
                    <p>
                      Active:
                      <span className="font-bold mr-2">{cameraCounts.active}</span>
                      Inactive:
                      <span className="font-bold">{cameraCounts.inactive}</span>
                    </p>
                  </div>
                }
                bgColor="bg-blue-900" // Example color adjustment
                iconBgColor="bg-blue-700"
              />
              {isAdmin() && (
                <>
                  <DashboardCard
                    icon={<FiUsers className="h-6 w-6 text-white" />} // Added icon size/color
                    title="Total Employees"
                    value={employeeCount}
                    bgColor="bg-green-900" // Adjusted colors
                    iconBgColor="bg-green-700"
                  />
                  <DashboardCard
                    icon={<FiShield className="h-6 w-6 text-white" />} // Added icon size/color
                    title="Security Personnel"
                    value={securityCount}
                    bgColor="bg-yellow-900" // Adjusted colors (using darker shades)
                    iconBgColor="bg-yellow-700"
                  />
                </>
              )}
            </div>
            <div className="flex space-x-4">
  {createAlertsTrendChart()}
  {createMostActiveCamsChart()}
  </div>
            <div className="bg-neutral-800 p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-4 px-4">Latest Alerts</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left table-auto">
                  <thead className="border-b border-neutral-600">
                    <tr>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Level</th>
                      <th className="px-4 py-3">Location</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestAlerts.length > 0 ? (
                      latestAlerts.map((alert) => (
                        <tr
                          key={alert.id}
                          className="border-b border-neutral-700 hover:bg-neutral-700/50 transition-colors"
                        >
                          <td className="px-4 py-3">
                            {formatTimestamp(alert.timestamp)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {alert.type}
                          </td>
                          <td className="px-4 py-3 capitalize">
                            {alert.level}
                          </td>
                          {/* Use actual level */}
                          <td className="px-4 py-3">
                            {formatLocation(alert)}
                          </td>
                          {/* Use actual zone_id */}
                          <td
                            className={`px-4 py-3 capitalize ${
                              alert.status === "active"
                                ? "text-red-400"
                                : "text-green-400"
                            }`}
                          >
                            {alert.status}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center space-x-3">
                              <Link
                                to={`/alerts/${alert.id}`}
                                className="text-cyan-400 hover:text-cyan-300 text-sm flex items-center"
                              >
                                <FiEye size={18} className="mr-1" />
                                View
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan="6"
                          className="text-center py-4 text-neutral-500"
                        >
                          No recent alerts found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {/* Link to view all alerts - check if total count > displayed count if possible */}
              <div className="mt-4 text-right">
                <Link
                  to="/alerts"
                  className="text-cyan-400 hover:text-cyan-300 text-sm flex items-center justify-end"
                >
                  View All Alerts <FiArrowRightCircle className="ml-1" />
                </Link>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
};
export default HomePage;
