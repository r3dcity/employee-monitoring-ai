import React, { useState, useEffect } from "react";
import { Link } from "react-router";
import Sidebar from "../../components/layout/Sidebar";
import { getAlerts } from "../../services/MainService";
import { useUser } from "../../context/UserContext";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiFilter,
  FiRefreshCw,
  FiTarget,
  FiEye,
} from "react-icons/fi";

const AlertsPage = () => {
  const [allAlerts, setAllAlerts] = useState([]);
  const [filteredAlerts, setFilteredAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [summary, setSummary] = useState(""); // State for the summary
  const [summaryLoading, setSummaryLoading] = useState(false); // Loading state for summary
  const [summaryError, setSummaryError] = useState(null); // Error state for summary
  const { token } = useUser();


  const generateSummary = async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    setSummary(""); // Clear previous summary

    const OLLAMA_API_URL = "http://localhost:11434/api/generate"; // Default Ollama API endpoint
    const MODEL_NAME = "openhermes:latest"; // Or your chosen small model

    const prompt = `Summarize the provided security alert JSON data. Output a text-only bulleted list in a simple text format without MD elements covering:
- Overall Status: Total, Active, Resolved counts.
- Key Trends: Common alert types and locations.
- Priority Items: Mention any high-priority active alerts.
- Quick Stats: Include relevant numbers.
Keep it brief and informative and made for untechnical persons.:\n\n${JSON.stringify(filteredAlerts)}}`;

    try {
      const response = await fetch(OLLAMA_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          prompt: prompt,
          stream: false, // Get the full response at once
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API request failed: ${response.statusText}`);
      }

      const data = await response.json();
      let processedResponse = data.response || "";
      processedResponse = processedResponse.replace(/<think>.*?<\/think>/gs, "");

      setSummary(processedResponse.trim() || "No summary could be generated.");
    } catch (err) {
      console.error("Failed to generate summary:", err);
      setSummaryError(
        `Failed to connect to Ollama or generate summary. Make sure Ollama is running. (${err.message})`
      );
    } finally {
      setSummaryLoading(false);
    }
  };

  // Fetch all alerts only on mount or token change
  useEffect(() => {
    fetchAlerts();
  }, [token]);

  // Filter alerts whenever allAlerts or filterStatus changes
  useEffect(() => {
    if (filterStatus === "all") {
      setFilteredAlerts(allAlerts);
    } else {
      setFilteredAlerts(
        allAlerts.filter((alert) => alert.status === filterStatus)
      );
    }
  }, [allAlerts, filterStatus]);

  const fetchAlerts = async () => {
    setLoading(true);
    setError(null);
    try {
      // Always fetch all alerts, remove status param
      const response = await getAlerts();
      setAllAlerts(response.data.alerts || []);
    } catch (err) {
      console.error("Failed to fetch alerts:", err);
      setError("Failed to load alerts. Please try again later.");
      setAllAlerts([]); // Reset all alerts on error
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (status) => {
    setFilterStatus(status);
  };

  // Format timestamp to readable date/time
  const formatTimestamp = (isoString) => {
    if (!isoString) return "N/A";
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  };

  // Format location information to be more descriptive
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


  const alertStats = {
    // Calculate stats based on allAlerts
    total: allAlerts.length,
    active: allAlerts.filter((alert) => alert.status === "active").length,
    resolved: allAlerts.filter((alert) => alert.status === "resolved").length,
  };

  const StatCard = ({ icon, title, value, bgColor, iconBgColor }) => (
    <div className={`${bgColor} p-5 rounded-lg shadow-md mb-4`}>
      <div className="flex items-center mb-2">
        <div className={`${iconBgColor} p-3 rounded-md mr-4`}>{icon}</div>
        <div className="flex-1">
          <span className="text-lg font-semibold block">{title}</span>
          <div className="text-2xl font-bold">{value}</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-neutral-900 text-white">
      <Sidebar />
      <main className="flex-1 p-6 md:p-8 lg:p-10 overflow-y-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-semibold">Security Alerts</h1>
          <button
            onClick={fetchAlerts}
            className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded inline-flex items-center transition-colors duration-200"
          >
            <FiRefreshCw className="mr-2" />
            Refresh
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <StatCard
            icon={<FiAlertTriangle className="h-6 w-6 text-white" />}
            title="Total Alerts"
            value={alertStats.total}
            bgColor="bg-neutral-800"
            iconBgColor="bg-neutral-700"
          />
          <StatCard
            icon={<FiAlertTriangle className="h-6 w-6 text-white" />}
            title="Active Alerts"
            value={alertStats.active}
            bgColor="bg-red-900"
            iconBgColor="bg-red-700"
          />
          <StatCard
            icon={<FiCheckCircle className="h-6 w-6 text-white" />}
            title="Resolved Alerts"
            value={alertStats.resolved}
            bgColor="bg-green-900"
            iconBgColor="bg-green-700"
          />
        </div>

        {/* Filter Controls */}
        <div className="flex items-center mb-4 bg-neutral-800 p-3 rounded-lg">
          <FiFilter className="mr-2 text-neutral-400" />
          <span className="mr-4 text-neutral-300">Filter:</span>
          <button
            onClick={() => handleFilterChange("all")}
            className={`px-3 py-1 mr-2 rounded ${
              filterStatus === "all"
                ? "bg-cyan-600 text-white"
                : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
            }`}
          >
            All
          </button>
          <button
            onClick={() => handleFilterChange("active")}
            className={`px-3 py-1 mr-2 rounded ${
              filterStatus === "active"
                ? "bg-red-600 text-white"
                : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
            }`}
          >
            Active
          </button>
          <button
            onClick={() => handleFilterChange("resolved")}
            className={`px-3 py-1 rounded ${
              filterStatus === "resolved"
                ? "bg-green-600 text-white"
                : "bg-neutral-700 text-neutral-300 hover:bg-neutral-600"
            }`}
          >
            Resolved
          </button>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-xl text-neutral-400">Loading alerts...</div>
          </div>
        ) : /* Error State */
        error ? (
          <div
            className="bg-red-800 border border-red-600 text-red-100 px-4 py-3 rounded relative mb-6"
            role="alert"
          >
            <strong className="font-bold">Error:</strong>
            <span className="block sm:inline"> {error}</span>
          </div>
        ) : /* No Alerts Found */
        // Check filteredAlerts for rendering
        filteredAlerts.length === 0 ? (
          <div className="text-center py-10 text-neutral-500 bg-neutral-800 rounded-lg">
            No alerts found matching the current filter.
          </div>
        ) : (
          /* Alerts Table */
          <div className="bg-neutral-800 p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Latest Alerts</h2>
          <div className="overflow-x-auto">
              <table className="w-full text-left table-auto">
                  <thead className="border-b border-neutral-600">
                      <tr>
                          <th className="px-4 py-3">Timestamp</th>
                          <th className="px-4 py-3">Type</th>
                          <th className="px-4 py-3">Level</th>
                          <th className="px-4 py-3">Location</th> {/* Assuming zone_id is available */}
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Actions</th> {/* Header for details link */}
                      </tr>
                  </thead>
                <tbody>
                  {/* Render filteredAlerts */}
                  {filteredAlerts.length > 0 ? ( filteredAlerts.map((alert) => (
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
                      <td className="px-4 py-3 capitalize">{alert.level}</td>
                      <td className="px-4 py-3">{formatLocation(alert)}</td>
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
                  ))) : (
                    <tr>
                      <td colSpan="6" className="text-center py-4 text-neutral-500">No recent alerts found.</td>
                    </tr>
                  )}
                </tbody>
              </table>

            </div>
          </div>
        )}
        {/* Summary Section */}
<div className="mt-6 p-4 bg-neutral-800 rounded-lg">
  <button
    onClick={generateSummary}
    disabled={summaryLoading || filteredAlerts.length === 0}
    className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 px-4 rounded inline-flex items-center transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed mb-3"
  >
    {summaryLoading ? "Generating..." : "Generate Summary"}
  </button>
  {summaryLoading && (
    <div className="text-neutral-400">Generating summary...</div>
  )}
  {summaryError && (
    <div className="text-red-400 text-sm mt-2">
      Error: {summaryError}
    </div>
  )}
  {summary && !summaryLoading && !summaryError && (
    <div className="text-neutral-200 whitespace-pre-wrap">
      <h3 className="font-semibold mb-1">Summary:</h3>
      {summary}
    </div>
  )}
   {!summary && !summaryLoading && !summaryError && filteredAlerts.length > 0 && (
     <div className="text-neutral-500 text-sm italic">Click "Generate Summary" to get an AI overview of the filtered alerts.</div>
   )}
   {!summary && !summaryLoading && !summaryError && filteredAlerts.length === 0 && (
     <div className="text-neutral-500 text-sm italic">No alerts selected to summarize.</div>
   )}
</div>
      </main>
    </div>
  );
};

export default AlertsPage;
