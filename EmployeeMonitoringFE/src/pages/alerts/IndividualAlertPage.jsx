import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router";
import Sidebar from "../../components/layout/Sidebar";
import {
  getAlert,
  updateAlert,
  getCamerasList,
} from "../../services/MainService";
import { useUser } from "../../context/UserContext";
import { SERVER_URL } from "../../utils/constants";
import { LoadingComponent } from "../../components/LoadingComponent";
import AuthenticatedImage from "../../components/AuthenticatedImage";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiArrowLeft,
  FiUser,
  FiMapPin,
  FiInfo,
  FiCalendar,
  FiClock,
  FiCamera,
  FiNavigation,
  FiDownload,
  FiLoader,
  FiMaximize,
  FiX,
} from "react-icons/fi";
import axios from "axios";

const formatTimestamp = (isoString) => {
  if (!isoString) return "N/A";
  try {
    const date = new Date(isoString);
    return date.toLocaleString();
  } catch {
    return isoString;
  }
};

const AlertLevelBadge = ({ level }) => {
  let bgColor = "bg-blue-600";
  if (level === "high") bgColor = "bg-red-600";
  else if (level === "medium") bgColor = "bg-yellow-600";
  else if (level === "low") bgColor = "bg-blue-600";

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${bgColor}`}>
      {level?.toUpperCase() || "UNKNOWN"}
    </span>
  );
};

const IndividualAlertPage = () => {
  const { alertId } = useParams();
  const navigate = useNavigate();
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [cameras, setCameras] = useState([]);
  const { token } = useUser();
  const [screenshotUrl, setScreenshotUrl] = useState(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const [screenshotError, setScreenshotError] = useState(false);
  const [isScreenshotFullscreen, setIsScreenshotFullscreen] = useState(false);

  useEffect(() => {
    fetchAlertDetails();
    fetchCameras();
  }, [alertId, token]);

  useEffect(() => {
    if (alert?.id && alert.screenshot && token) {
      setScreenshotLoading(true);
      setScreenshotError(false);
      setScreenshotUrl(null);

      let objectUrl = null;
      let cancelled = false;

      const fetchScreenshot = async () => {
        try {
          const response = await axios.get(
            `${SERVER_URL}/alerts/screenshot/${alert.id}`,
            {
              headers: { Authorization: `Bearer ${token}` },
              responseType: "blob",
            }
          );
          if (cancelled) return;
          objectUrl = URL.createObjectURL(response.data);
          setScreenshotUrl(objectUrl);
        } catch (err) {
          if (cancelled) return;
          console.error("Failed to fetch screenshot:", err);
          setScreenshotError(true);
        } finally {
          if (!cancelled) setScreenshotLoading(false);
        }
      };

      fetchScreenshot();

      return () => {
        cancelled = true;
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
        }
      };
    } else {
      setScreenshotUrl(null);
      setScreenshotLoading(false);
      setScreenshotError(false);
    }
  }, [alert?.id, alert?.screenshot, token]);

  const fetchCameras = async () => {
    try {
      const response = await getCamerasList();
      setCameras(response.data.cameras || []);
    } catch (err) {
      console.error("Failed to fetch cameras:", err);
    }
  };

  const fetchAlertDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getAlert(alertId);
      setAlert(response.data.alert);
      console.log("Alert details:", response.data.alert);
    } catch (err) {
      console.error("Failed to fetch alert details:", err);
      setError("Failed to load alert details. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResolveAlert = async () => {
    if (!alert || alert.status === "resolved") return;

    setUpdatingStatus(true);
    try {
      await updateAlert(alertId, {
        status: "resolved",
        resolved_at: new Date().toISOString(),
      });
      fetchAlertDetails();
    } catch (err) {
      console.error("Failed to resolve alert:", err);
      setError("Failed to resolve alert. Please try again.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getCameraName = (cameraId) => {
    if (!cameraId) return null;
    const camera = cameras.find((cam) => cam.id === cameraId);
    return camera ? camera.name : null;
  };

  const getCameraLocation = (cameraId) => {
    if (!cameraId) return null;
    const camera = cameras.find((cam) => cam.id === cameraId);
    return camera ? camera.location : null;
  };

  const toggleFullscreen = () => {
    setIsScreenshotFullscreen(!isScreenshotFullscreen);
  };

  return (
    <div className="flex h-screen bg-neutral-900 text-white">
      <Sidebar />
      <main className="flex-1 p-6 md:p-8 lg:p-10 overflow-y-auto">
        <div className="flex items-center mb-8">
          <button
            onClick={() => navigate("/alerts")}
            className="mr-4 p-2 rounded hover:bg-neutral-800"
          >
            <FiArrowLeft size={20} />
          </button>
          <h1 className="text-3xl font-semibold">Alert Details</h1>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <LoadingComponent />
          </div>
        ) : error ? (
          <div
            className="bg-red-800 border border-red-600 text-red-100 px-4 py-3 rounded relative mb-6"
            role="alert"
          >
            <strong className="font-bold">Error:</strong>
            <span className="block sm:inline"> {error}</span>
          </div>
        ) : !alert ? (
          <div className="text-center py-10 text-neutral-500 bg-neutral-800 rounded-lg">
            Alert not found.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-neutral-800 rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <div
                      className={`p-3 rounded-md mr-4 ${
                        alert.status === "active"
                          ? "bg-red-700"
                          : "bg-green-700"
                      }`}
                    >
                      {alert.status === "active" ? (
                        <FiAlertTriangle className="h-6 w-6 text-white" />
                      ) : (
                        <FiCheckCircle className="h-6 w-6 text-white" />
                      )}
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold">{alert.type}</h2>
                      <div className="flex items-center mt-1">
                        <span
                          className={`capitalize font-medium mr-3 ${
                            alert.status === "active"
                              ? "text-red-400"
                              : "text-green-400"
                          }`}
                        >
                          {alert.status}
                        </span>
                        <AlertLevelBadge level={alert.level} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    {alert.status === "active" && (
                      <button
                        onClick={handleResolveAlert}
                        disabled={updatingStatus}
                        className="bg-green-600 hover:bg-green-500 text-white py-2 px-4 rounded inline-flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <FiCheckCircle className="mr-2" />
                        Mark Resolved
                      </button>
                    )}
                  </div>
                </div>

                <div className="border-t border-neutral-700 pt-4 mt-4">
                  <h3 className="text-lg font-semibold mb-2 flex items-center">
                    <FiInfo className="mr-2" /> Description
                  </h3>
                  <p className="text-neutral-300">
                    {alert.explanation || "No description available."}
                  </p>
                </div>

                <div className="border-t border-neutral-700 pt-4 mt-4">
                  <h3 className="text-lg font-semibold mb-2 flex items-center">
                    <FiClock className="mr-2" /> Timestamps
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <div className="text-neutral-400 text-sm">Detected:</div>
                      <div className="flex items-center">
                        <FiCalendar className="mr-2 text-neutral-500" />
                        {formatTimestamp(alert.timestamp)}
                      </div>
                    </div>

                    {alert.status === "resolved" && (
                      <div>
                        <div className="text-neutral-400 text-sm">
                          Resolved:
                        </div>
                        <div className="flex items-center">
                          <FiCalendar className="mr-2 text-neutral-500" />
                          {formatTimestamp(alert.resolved_at)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-neutral-700 pt-4 mt-4">
                  <h3 className="text-lg font-semibold mb-2 flex items-center">
                    <FiNavigation className="mr-2" /> Location Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {alert.camera_id && (
                      <div className="bg-neutral-700 p-3 rounded">
                        <div className="flex items-center text-cyan-400 mb-1">
                          <FiCamera className="mr-2" />
                          Camera
                        </div>
                        <p className="font-medium mb-1">
                          {getCameraName(alert.camera_id) ||
                            `Camera #${alert.camera_id}`}
                        </p>
                        {getCameraLocation(alert.camera_id) && (
                          <p className="text-sm text-neutral-400">
                            {getCameraLocation(alert.camera_id)}
                          </p>
                        )}
                      </div>
                    )}

                    {alert.zone_id && (
                      <div className="bg-neutral-700 p-3 rounded">
                        <div className="flex items-center text-cyan-400 mb-1">
                          <FiMapPin className="mr-2" />
                          Zone
                        </div>
                        <p className="font-medium">
                          {alert.zone_name || `Zone #${alert.zone_id}`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {alert.screenshot && (
                <div className="bg-neutral-800 rounded-lg shadow-md p-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center">
                    <FiCamera className="mr-2" />
                    Alert Screenshot
                  </h3>
                  <div className="relative bg-black rounded overflow-hidden border border-neutral-700 group">
                    <div className="aspect-video flex items-center justify-center">
                      {screenshotLoading && (
                        <div className="text-neutral-400 flex flex-col items-center">
                          <FiLoader className="animate-spin h-8 w-8 mb-2" />
                          Loading Screenshot...
                        </div>
                      )}
                      {screenshotError && (
                        <div className="text-red-400 flex flex-col items-center">
                          <FiAlertTriangle className="h-8 w-8 mb-2" />
                          Failed to load screenshot.
                        </div>
                      )}
                      {!screenshotLoading &&
                        !screenshotError &&
                        screenshotUrl && (
                          <img
                            src={screenshotUrl}
                            alt="Alert Evidence"
                            className="max-w-full max-h-full object-contain cursor-pointer"
                            onClick={toggleFullscreen}
                          />
                        )}
                      {!screenshotLoading &&
                        !screenshotError &&
                        !screenshotUrl &&
                        !alert.screenshot && (
                          <div className="text-neutral-500">
                            No screenshot available.
                          </div>
                        )}
                    </div>
                    {screenshotUrl && (
                      <>
                        <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 text-xs rounded">
                          {formatTimestamp(alert.timestamp)}
                        </div>
                        <button
                          onClick={toggleFullscreen}
                          className="absolute top-2 right-2 p-2 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          title="View Fullscreen"
                        >
                          <FiMaximize size={18} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="bg-neutral-800 rounded-lg shadow-md p-6">
              <h3 className="text-lg font-semibold mb-4">
                Related Information
              </h3>

              <div className="space-y-4">
                {alert.zone_id && (
                  <div className="py-2 border-b border-neutral-700">
                    <div className="text-neutral-400 text-sm mb-1">Zone:</div>
                    <div className="flex items-center">
                      <FiMapPin className="mr-2 text-neutral-500" />
                      <a
                        href={`/video-cameras/${alert.camera_id}/zones/${alert.zone_id}`}
                        className="text-cyan-400 hover:text-cyan-300"
                      >
                        {alert.zone_name || `Zone #${alert.zone_id}`}
                      </a>
                    </div>
                  </div>
                )}

                {alert.employee_id && (
                  <div className="py-2 border-b border-neutral-700">
                    <div className="text-neutral-400 text-sm mb-1">
                      Employee:
                    </div>
                    <div className="flex items-center">
                      <FiUser className="mr-2 text-neutral-500" />
                      <a
                        href={`/employees/${alert.employee_id}`}
                        className="text-cyan-400 hover:text-cyan-300"
                      >
                        {alert.employee_name ||
                          `Employee #${alert.employee_id}`}
                      </a>
                    </div>
                  </div>
                )}

                {alert.alert_rule_id && (
                  <div className="py-2 border-b border-neutral-700">
                    <div className="text-neutral-400 text-sm mb-1">
                      Alert Rule:
                    </div>
                    <div className="flex items-center">
                      <FiInfo className="mr-2 text-neutral-500" />
                      <span>Rule #{alert.alert_rule_id}</span>
                    </div>
                  </div>
                )}
                {alert.type && (
                  <div className="py-2 border-b border-neutral-700">
                    <div className="text-neutral-400 text-sm mb-1">
                      Alert Type:
                    </div>
                    <div className="flex items-center">
                      <FiAlertTriangle className="mr-2 text-neutral-500" />
                      <span className="capitalize">
                        {alert.type.replace(/_/g, " ")}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {isScreenshotFullscreen && screenshotUrl && (
          <div
            className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4"
            onClick={toggleFullscreen}
          >
            <button
              onClick={toggleFullscreen}
              className="absolute top-4 right-4 text-white text-3xl z-50"
              title="Close Fullscreen"
            >
              <FiX />
            </button>
            <img
              src={screenshotUrl}
              alt="Alert Evidence Fullscreen"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </main>
    </div>
  );
};

export default IndividualAlertPage;
