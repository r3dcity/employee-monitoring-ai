import React, { useMemo, useState } from "react";
import { Link } from "react-router";
import { getAlertsSummary, getErrorMessage } from "../../services/MainService";
import { useAlerts } from "../../services/queries";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiFilter,
  FiRefreshCw,
  FiTarget,
  FiEye,
} from "react-icons/fi";

const AlertsPage = () => {
  // Kept up to date by live events (new alerts invalidate the query)
  const { data: allAlerts = [], isLoading: loading, error: loadError, refetch } = useAlerts();
  const error = loadError ? "Failed to load alerts. Please try again later." : null;
  const [filterStatus, setFilterStatus] = useState("all");
  const [summary, setSummary] = useState("");
  const [summarySource, setSummarySource] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState(null);

  const filteredAlerts = useMemo(
    () => (filterStatus === "all" ? allAlerts : allAlerts.filter((alert) => alert.status === filterStatus)),
    [allAlerts, filterStatus]
  );

  // The server aggregates the alerts and (if configured) asks an LLM to describe the numbers
  const generateSummary = async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    setSummary("");
    try {
      const { data } = await getAlertsSummary({
        days: 7,
        status: filterStatus === "all" ? undefined : filterStatus,
      });
      setSummary(data.summary);
      setSummarySource(data.source);
    } catch (err) {
      setSummaryError(getErrorMessage(err, "Could not generate a summary."));
    } finally {
      setSummaryLoading(false);
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
    <div className="flex h-full bg-neutral-900 text-white">
      <main className="flex-1 p-6 md:p-8 lg:p-10 overflow-y-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-semibold">Security Alerts</h1>
          <button
            onClick={() => refetch()}
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
    disabled={summaryLoading}
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
      <h3 className="font-semibold mb-1">
        Last 7 days{summarySource === "llm" ? " (AI summary)" : ""}:
      </h3>
      {summary}
    </div>
  )}
   {!summary && !summaryLoading && !summaryError && filteredAlerts.length > 0 && (
     <div className="text-neutral-500 text-sm italic">Click "Generate Summary" for a plain-language overview of the last 7 days.</div>
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
