import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import Sidebar from "../../components/layout/Sidebar";
import {
  getCamera,
  getAlertRulesForCamera,
  updateAlertRule,
  deleteCamera,
  getZones,
  createZone,
  deleteZone as deleteZoneRequest,
  getErrorMessage,
} from "../../services/MainService";
import { useUser } from "../../context/UserContext";
import CameraPlayer from "../../components/video/CameraPlayer";
import {
  FiSave,
  FiPlus,
  FiTrash,
  FiArrowDown,
  FiGrid,
  FiArrowLeft,
  FiMapPin,
  FiServer,
  FiLink,
  FiWifi,
  FiTag,
  FiAlertCircle,
  FiInfo,
  FiRefreshCw,
  FiMenu,
  FiX,
  FiSliders,
  FiToggleLeft,
  FiToggleRight,
} from "react-icons/fi";

const IndividualVideoCameraPage = () => {
  const { cameraId } = useParams();
  const navigate = useNavigate();
  const [camera, setCamera] = useState(null);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentZone, setCurrentZone] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { token } = useUser();
  const [showOptionsDropdown, setShowOptionsDropdown] = useState(false);
  const [cameraRules, setCameraRules] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState(null);
  const optionsButtonRef = useRef(null);

  const videoContainerRef = useRef(null);

  const fetchCameraData = async () => {
    setRefreshing(true);
    setError(null);
    setRulesLoading(true);
    setRulesError(null);
    try {
      const response = await getCamera(cameraId);
      const cam = response.data.camera;
      setCamera(cam);

      try {
        const zonesResponse = await getZones(cameraId);
        setZones(zonesResponse.data.zones || []);
      } catch (zoneErr) {
        console.error("Failed to fetch zones for camera:", zoneErr);
      }

      try {
        const rulesResponse = await getAlertRulesForCamera(cameraId);
        setCameraRules(rulesResponse.data || []);
      } catch (ruleErr) {
        console.error("Failed to fetch rules for camera:", ruleErr);
        setRulesError(ruleErr.response?.data?.error || "Failed to load rules.");
      }
    } catch (err) {
      console.error("Failed to fetch camera details:", err);
      setError("Failed to load camera details. Please try again later.");
    } finally {
      setRefreshing(false);
      setLoading(false);
      setRulesLoading(false);
    }
  };

  useEffect(() => {
    if (cameraId && token) {
      fetchCameraData();
    } else {
      setError("Missing camera ID or authentication.");
      setLoading(false);
    }
  }, [cameraId, token]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        optionsButtonRef.current &&
        !optionsButtonRef.current.contains(event.target)
      ) {
        setShowOptionsDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [optionsButtonRef]);

  const handleManualRefresh = () => {
    setLoading(true);
    setError(null);
    fetchCameraData();
  };

  const startDrawZone = () => {
    setEditMode(true);
    setIsDrawing(true);
    setCurrentZone({
      id: `temp-${Date.now()}`,
      name: `Zone ${zones.length + 1}`,
      points: [],
    });
  };

  const cancelDrawZone = () => {
    setEditMode(false);
    setIsDrawing(false);
    setCurrentZone(null);
  };

  const DeleteModal = () => (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-neutral-800 rounded-lg p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold">Confirm Deletion</h3>
          <button
            onClick={handleDeleteCancel}
            className="text-neutral-400 hover:text-white"
          >
            <FiX size={24} />
          </button>
        </div>
        <p className="mb-6">
          Are you sure you want to delete{" "}
          <span className="font-semibold">{camera.name}</span> camera? This
          action cannot be undone.
        </p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={handleDeleteCancel}
            className="cursor-pointer px-4 py-2 border border-neutral-600 rounded-md hover:bg-neutral-700"
          >
            Cancel
          </button>
          <button
            onClick={handleDeleteConfirm}
            className="cursor-pointer px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );

  const handleDeleteCancel = () => {
    setShowDeleteModal(false);
  };

  const handleDeleteConfirm = async () => {
    try {
      setLoading(true);
      await deleteCamera(cameraId);
      navigate("/video-cameras");
    } catch (err) {
      console.error("Error deleting camera:", err);
      setError(getErrorMessage(err, "Failed to delete camera. Please try again."));
    } finally {
      setLoading(false);
      setShowOptionsDropdown(false);
    }
  };

  const handleCameraDelete = async () => {
    setShowDeleteModal(true);
  };

  const saveZone = async () => {
    if (!currentZone || currentZone.points.length < 3) {
      setError("A valid zone must have at least 3 points.");
      return;
    }
    try {
      setLoading(true);
      const response = await createZone({
        name: currentZone.name,
        cameraId: camera.id,
        cameraName: camera.name,
        points: currentZone.points,
      });
      setZones((prev) => [...prev, response.data.zone]);
      setEditMode(false);
      setIsDrawing(false);
      setCurrentZone(null);
    } catch (err) {
      console.error("Failed to save zone:", err);
      setError(getErrorMessage(err, "Failed to save zone. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const deleteZone = async (zoneId) => {
    try {
      setLoading(true);
      await deleteZoneRequest(zoneId);
      setZones((prev) => prev.filter((zone) => zone.id !== zoneId));
    } catch (err) {
      console.error("Failed to delete zone:", err);
      setError(getErrorMessage(err, "Failed to delete zone. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const handleCanvasClick = (e) => {
    if (!isDrawing || !editMode) return;

    // Store points normalized to the displayed video (0..1) so they match the camera
    // frame regardless of the size the stream is shown at.
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1);

    setCurrentZone((prev) => ({
      ...prev,
      points: [...prev.points, { x, y }],
    }));
  };

  const polygonPoints = (points) => {
    return points.map((point) => `${point.x},${point.y}`).join(" ");
  };

  const toggleRuleActiveStatus = async (rule) => {
    setRulesLoading(true);
    try {
      await updateAlertRule(rule.id, { is_active: !rule.is_active });
      const rulesResponse = await getAlertRulesForCamera(cameraId);
      setCameraRules(rulesResponse.data || []);
    } catch (err) {
      console.error("Failed to toggle rule status:", err);
      setRulesError(
        err.response?.data?.error || "Failed to update rule status."
      );
    } finally {
      setRulesLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-neutral-900 text-white">
      <Sidebar />
      <main className="flex-1 p-6 md:p-8 lg:p-10 md:pt-6 lg:pt-6  overflow-y-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center">
            <button
              onClick={() => navigate("/video-cameras")}
              className="mr-4 p-2 rounded hover:bg-neutral-800"
            >
              <FiArrowLeft size={20} />
            </button>
            <h1 className="text-3xl font-semibold">
              {loading ? "Loading Camera..." : camera?.name || "Camera Details"}
            </h1>
          </div>

          {!editMode ? (
            <div className="flex space-x-2 relative" ref={optionsButtonRef}>
              <button
                onClick={startDrawZone}
                className="cursor-pointer bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded inline-flex items-center transition-colors duration-200"
              >
                <FiPlus className="mr-2" />
                Add Zone
              </button>
              <button
                className="cursor-pointer bg-neutral-700 hover:bg-neutral-600 text-white font-bold py-2 px-4 rounded inline-flex items-center transition-colors duration-200"
                onClick={() => setShowOptionsDropdown(!showOptionsDropdown)}
              >
                <FiMenu className="mr-2" />
                Options
              </button>

              {showOptionsDropdown && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-neutral-700 rounded-md shadow-lg z-10 py-1">
                  <button
                    onClick={() => {
                      handleManualRefresh();
                      setShowOptionsDropdown(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-neutral-100 hover:bg-neutral-600 flex items-center transition-colors duration-150"
                  >
                    <FiRefreshCw
                      className={`mr-2 ${refreshing ? "animate-spin" : ""}`}
                    />
                    Refresh
                  </button>
                  <button
                    onClick={handleCameraDelete}
                    className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-neutral-600 flex items-center transition-colors duration-150"
                  >
                    <FiTrash className="mr-2" />
                    Delete Camera
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex space-x-2">
              <button
                onClick={cancelDrawZone}
                className="bg-neutral-700 hover:bg-neutral-600 text-white font-bold py-2 px-4 rounded inline-flex items-center transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                onClick={saveZone}
                disabled={!currentZone || currentZone.points.length < 3}
                className={`${
                  !currentZone || currentZone.points.length < 3
                    ? "bg-cyan-800 cursor-not-allowed"
                    : "bg-cyan-600 hover:bg-cyan-500"
                } text-white font-bold py-2 px-4 rounded inline-flex items-center transition-colors duration-200`}
              >
                <FiSave className="mr-2" />
                Save Zone
              </button>
            </div>
          )}
        </div>

        {loading && !camera ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-xl text-neutral-400">
              Loading camera data...
            </div>
          </div>
        ) : error ? (
          <div
            className="bg-red-800 border border-red-600 text-red-100 px-4 py-3 rounded relative mb-6"
            role="alert"
          >
            <strong className="font-bold">Error:</strong>
            <span className="block sm:inline"> {error}</span>
          </div>
        ) : !camera ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-xl text-neutral-400">
              Could not load camera data.
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-neutral-800 rounded-lg shadow-md p-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Live Feed with Zones</h2>
                <div
                  className={`
                                    px-3 py-1 rounded-full text-sm font-medium flex items-center
                                    ${
                                      isStreamActive
                                        ? "bg-green-500 text-green-900"
                                        : "bg-red-500 text-red-900"
                                    }
                                `}
                >
                  <span
                    className={`mr-1 w-2 h-2 rounded-full ${
                      isStreamActive
                        ? "bg-green-900 animate-pulse"
                        : "bg-red-900"
                    }`}
                  ></span>
                  {isStreamActive ? "LIVE" : "OFFLINE"}
                </div>
              </div>

              <CameraPlayer
                camera={camera}
                onStatusChange={(status) => setIsStreamActive(status === "live")}
              >
                {/* Zone layer: normalized coordinates, so viewBox 0..1 stretched over the video */}
                <div className="absolute inset-0" ref={videoContainerRef} onClick={handleCanvasClick}>
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  viewBox="0 0 1 1"
                  preserveAspectRatio="none"
                >
                  {zones.map((zone) => (
                    <polygon
                      key={zone.id}
                      points={polygonPoints(zone.points)}
                      className="fill-cyan-500/20 stroke-cyan-500"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}

                  {currentZone && currentZone.points.length > 0 && (
                    <polygon
                      points={polygonPoints(currentZone.points)}
                      className="fill-red-500/40 stroke-red-700"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </svg>
                </div>
              </CameraPlayer>
              {editMode && (
                <div className="absolute inset-x-0 bottom-4 flex justify-center pointer-events-none">
                  <div className="bg-black/70 text-white px-4 py-2 rounded">
                    Click to add points. Minimum 3 points needed.
                  </div>
                </div>
              )}

              <p className="mt-3 text-sm text-neutral-400 flex items-center">
                <FiInfo className="mr-2 flex-shrink-0" />
                Detection runs continuously on the server, even when nobody is watching. The
                camera&apos;s active rules decide which alerts are raised.
              </p>
            </div>

            <div className="bg-neutral-800 rounded-lg shadow-md p-4 flex flex-col">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <FiInfo className="mr-2" />
                Camera Information
              </h2>

              <div className="mb-6 space-y-2">
                <p className="flex justify-between py-2 border-b border-neutral-700">
                  <span className="text-neutral-400 flex items-center">
                    <FiTag className="mr-2" />
                    Name:
                  </span>
                  <span>{camera?.name}</span>
                </p>
                <p className="flex justify-between py-2 border-b border-neutral-700">
                  <span className="text-neutral-400 flex items-center">
                    <FiMapPin className="mr-2" />
                    Location:
                  </span>
                  <span>{camera?.location || "N/A"}</span>
                </p>
                <p className="flex justify-between py-2 border-b border-neutral-700">
                  <span className="text-neutral-400 flex items-center">
                    <FiServer className="mr-2" />
                    IP Address:
                  </span>
                  <span className="font-mono">{camera?.ip || "N/A"}</span>
                </p>
                <p className="flex justify-between py-2 border-b border-neutral-700">
                  <span className="text-neutral-400 flex items-center">
                    <FiLink className="mr-2" />
                    Port:
                  </span>
                  <span className="font-mono">{camera?.port || "N/A"}</span>
                </p>
                <p className="flex justify-between py-2 border-b border-neutral-700">
                  <span className="text-neutral-400 flex items-center">
                    <FiWifi className="mr-2" />
                    Username:
                  </span>
                  <span className="font-mono">{camera?.username || "N/A"}</span>
                </p>

                <p className="flex justify-between py-2 border-b border-neutral-700">
                  <span className="text-neutral-400 flex items-center">
                    <FiAlertCircle className="mr-2" />
                    Status:
                  </span>
                  <span
                    className={
                      isStreamActive ? "text-green-400" : "text-red-400"
                    }
                  >
                    {isStreamActive ? "Active" : camera?.stream_status || "Inactive"}
                  </span>
                </p>
                <p className="flex justify-between py-2 border-b border-neutral-700">
                  <span className="text-neutral-400 flex items-center">
                    <FiGrid className="mr-2" />
                    RTSP URL:
                  </span>
                  <span className="font-mono text-xs break-all">
                    rtsp://{camera?.username}:********@{camera?.ip}:
                    {camera?.port}
                    {camera?.stream_path}
                  </span>
                </p>
              </div>

              <h3 className="text-lg font-semibold mb-2 flex items-center">
                <FiGrid className="mr-2" />
                Defined Zones ({zones.length})
              </h3>

              {zones.length === 0 ? (
                <div className="text-center py-4 text-neutral-500 bg-neutral-700/30 rounded">
                  No zones defined. Click "Add Zone" to create one.
                </div>
              ) : (
                <div className="overflow-y-auto flex-grow">
                  {zones.map((zone) => (
                    <div
                      key={zone.id}
                      className="flex items-center justify-between p-3 bg-neutral-700/30 mb-2 rounded"
                    >
                      <div>
                        <p className="font-medium">{zone.name}</p>
                        <p className="text-xs text-neutral-400">
                          {zone.points?.length || 0} points
                        </p>
                      </div>
                      <div className="flex space-x-2">
                        <button
                          className="p-1 text-neutral-400 hover:text-red-500"
                          onClick={() => deleteZone(zone.id)}
                        >
                          <FiTrash size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex-grow">
                <h3 className="text-lg font-semibold mb-3 flex items-center">
                  <FiSliders className="mr-2" /> Camera Rules
                </h3>
                {rulesLoading && "Loading rules..."}
                {rulesError && (
                  <p className="text-red-400 text-sm mb-2">
                    Error loading rules: {rulesError}
                  </p>
                )}
                {!rulesLoading && !rulesError && (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {cameraRules.length > 0 ? (
                      cameraRules.map((rule) => (
                        <div
                          key={rule.id}
                          className="flex justify-between items-center bg-neutral-700 p-2 rounded"
                        >
                          <span
                            className="text-sm flex-grow mr-4"
                            title={rule.description}
                          >
                            {rule.description.length > 40
                              ? `${rule.description.substring(0, 40)}...`
                              : rule.description}
                          </span>
                          <button
                            onClick={() => toggleRuleActiveStatus(rule)}
                            className={`p-1 rounded ${
                              rule.is_active
                                ? "text-green-400"
                                : "text-neutral-500"
                            } hover:bg-neutral-600 transition-colors`}
                            title={
                              rule.is_active
                                ? "Deactivate Rule"
                                : "Activate Rule"
                            }
                          >
                            {rule.is_active ? (
                              <FiToggleRight size={22} />
                            ) : (
                              <FiToggleLeft size={22} />
                            )}
                          </button>
                        </div>
                      ))
                    ) : (
                      <p className="text-neutral-500 text-sm">
                        No rules assigned to this camera.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {showDeleteModal && <DeleteModal />}
      </main>
    </div>
  );
};

export default IndividualVideoCameraPage;
