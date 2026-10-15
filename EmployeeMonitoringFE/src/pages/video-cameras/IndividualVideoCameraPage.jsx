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
import { buildStreamUrl as buildCameraStreamUrl } from "../../utils/streamUrl";
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

import excavatorImg from "../../assets/objects/excavator.jpg";
import glovesImg from "../../assets/objects/gloves.jpg";
import hardhatImg from "../../assets/objects/hardhat.jpg";
import ladderImg from "../../assets/objects/ladder.jpg";
import maskImg from "../../assets/objects/mask.jpg";
import noHardhatImg from "../../assets/objects/no-hardhat.jpg";
import noMaskImg from "../../assets/objects/no-mask.jpg";
import noSafetyVestImg from "../../assets/objects/no-safety-vest.jpg";
import personImg from "../../assets/objects/person.jpg";
import suvImg from "../../assets/objects/suv.jpg";
import safetyConeImg from "../../assets/objects/safety-cone.jpg";
import safetyVestImg from "../../assets/objects/safety-vest.jpg";
import busImg from "../../assets/objects/bus.jpg";
import dumpTruckImg from "../../assets/objects/dump-truck.jpg";
import fireHydrantImg from "../../assets/objects/fire-hydrant.jpg";
import machineryImg from "../../assets/objects/machinery.jpg";
import miniVanImg from "../../assets/objects/mini-van.jpg";
import sedanImg from "../../assets/objects/sedan.jpg";
import semiImg from "../../assets/objects/semi.jpg";
import trailerImg from "../../assets/objects/trailer.jpg";
import truckImg from "../../assets/objects/truck.jpg";
import truckAndTrailerImg from "../../assets/objects/truck-and-trailer.jpg";
import vanImg from "../../assets/objects/van.jpg";
import vehicleImg from "../../assets/objects/vehicle.jpg";
import wheelLoaderImg from "../../assets/objects/wheel-loader.jpg";
import faceRecognitionImg from "../../assets/objects/face-recognition.jpg";

const ppeImageMapping = {
  Excavator: excavatorImg,
  Gloves: glovesImg,
  Hardhat: hardhatImg,
  Ladder: ladderImg,
  Mask: maskImg,
  "NO-Hardhat": noHardhatImg,
  "NO-Mask": noMaskImg,
  "NO-Safety Vest": noSafetyVestImg,
  Person: personImg,
  SUV: suvImg,
  "Safety Cone": safetyConeImg,
  "Safety Vest": safetyVestImg,
  bus: busImg,
  "dump truck": dumpTruckImg,
  "fire hydrant": fireHydrantImg,
  machinery: machineryImg,
  "mini-van": miniVanImg,
  sedan: sedanImg,
  semi: semiImg,
  trailer: trailerImg,
  truck: truckImg,
  "truck and trailer": truckAndTrailerImg,
  van: vanImg,
  vehicle: vehicleImg,
  "wheel loader": wheelLoaderImg,
  face_recognition: faceRecognitionImg,
};

// Rule conditions may use any casing ("person"); stream filters need the detector's class name
const detectorNames = Object.keys(ppeImageMapping);
const toDetectorName = (name) =>
  detectorNames.find((d) => d.toLowerCase() === String(name).toLowerCase()) || name;

const extractRequiredFiltersFromRules = (rules) => {
  const requiredFilters = new Set();
  let needsFaceRecognition = false;

  rules.forEach((rule) => {
    if (!rule.is_active) return;

    try {
      // Parse conditions_json if it's a string
      const conditions =
        typeof rule.conditions_json === "string"
          ? JSON.parse(rule.conditions_json).conditions
          : rule.conditions_json.conditions;

      if (!conditions) return;

      conditions.forEach((condition) => {
        if (condition.type === "face_recognition") {
          needsFaceRecognition = true;
        }

        // For object detection, add the object name to required filters
        if (condition.type === "object_detected" && condition.object_name) {
          requiredFilters.add(toDetectorName(condition.object_name));
        }

        // For PPE missing conditions, we need specific detectors
        if (condition.type === "ppe_missing") {
          const ppeType = condition.ppe_type;
          if (ppeType === "mask") {
            requiredFilters.add("NO-Mask");
            requiredFilters.add("Person");
          } else if (ppeType === "helmet") {
            requiredFilters.add("NO-Hardhat");
            requiredFilters.add("Person");
          } else if (ppeType === "vest") {
            requiredFilters.add("NO-Safety Vest");
            requiredFilters.add("Person");
          }
        }

        // For object count conditions
        if (condition.type === "object_count" && condition.object_name) {
          requiredFilters.add(toDetectorName(condition.object_name));
        }
      });
    } catch (err) {
      console.error("Error parsing rule conditions:", err);
    }
  });

  return {
    objectFilters: Array.from(requiredFilters),
    needsFaceRecognition,
  };
};

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
  const [streamUrl, setStreamUrl] = useState("");
  const [isStreamActive, setIsStreamActive] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const { token } = useUser();
  const [filters, setFilters] = useState([]);
  const [showOptionsDropdown, setShowOptionsDropdown] = useState(false);
  const [cameraRules, setCameraRules] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState(null);
  const optionsButtonRef = useRef(null);

  const videoContainerRef = useRef(null);
  const streamRef = useRef(null);

  const handleSaveFilters = () => {
    let checkedFilters = [];
    const filterCheckboxes = document.querySelectorAll(
      '#expandableDiv input[type="checkbox"][data-filter-label]'
    );
    filterCheckboxes.forEach((checkbox) => {
      if (checkbox.checked) {
        checkedFilters.push(checkbox.getAttribute("data-filter-label"));
      }
    });

    // Set both filters array and face recognition state
    setFilters(checkedFilters);
    setStreamUrl(buildStreamUrl(checkedFilters));
  };

  const buildStreamUrl = (selectedFilters = null) =>
    buildCameraStreamUrl(camera?.name, token, selectedFilters || filters);

  const fetchCameraData = async () => {
    setRefreshing(true);
    setIsStreamActive(false);
    setError(null);
    setRulesLoading(true);
    setRulesError(null);
    try {
      const response = await getCamera(cameraId);
      const cam = response.data.camera;
      setCamera(cam);

      // Create initial filters array that includes face_recognition if enabled
      const initialFilters = [];
      if (cam?.filters?.includes("face_recognition")) {
        initialFilters.push("face_recognition");
      }

      setFilters(initialFilters);
      setStreamUrl(buildCameraStreamUrl(cam?.name, token, initialFilters));

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
      setStreamUrl("");
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
      setIsStreamActive(false);
      setStreamUrl("");
    }
  }, [cameraId, token]);

  useEffect(() => {
    if (camera && token) {
      setStreamUrl(buildStreamUrl());
      setIsStreamActive(false);
      setError(null);
    }
  }, [camera, token, filters]);

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

  useEffect(() => {
    // When camera rules load or change, extract required filters from them
    if (cameraRules.length > 0) {
      const { objectFilters, needsFaceRecognition } =
        extractRequiredFiltersFromRules(cameraRules);

      // If we're not in manual mode (user hasn't set filters), use rule-based filters
      if (filters.length === 0) {
        const newFilters = [...objectFilters];
        if (needsFaceRecognition) {
          newFilters.push("face_recognition");
        }
        setFilters(newFilters);
      }
    }
  }, [cameraRules]);

  const handleManualRefresh = () => {
    setLoading(true);
    setIsStreamActive(false);
    setError(null);
    fetchCameraData();
  };

  const handleStreamLoad = () => {
    if (streamRef.current) {
      streamRef.current.style.display = "block";
    }
    setIsStreamActive(true);
    setError(null);
  };

  const handleStreamError = () => {
    setError(
      "Stream unavailable or failed to load. Please check camera status or refresh."
    );
    setIsStreamActive(false);
    if (streamRef.current) {
      streamRef.current.style.display = "none";
    }
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
        ) : error && !isStreamActive ? (
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
                                      isStreamActive && !error
                                        ? "bg-green-500 text-green-900"
                                        : "bg-red-500 text-red-900"
                                    }
                                `}
                >
                  <span
                    className={`mr-1 w-2 h-2 rounded-full ${
                      isStreamActive && !error
                        ? "bg-green-900 animate-pulse"
                        : "bg-red-900"
                    }`}
                  ></span>
                  {isStreamActive && !error ? "LIVE" : "OFFLINE"}
                </div>
              </div>

              <div
                className="relative aspect-video bg-black"
                ref={videoContainerRef}
                onClick={handleCanvasClick}
              >
                {streamUrl && camera?.name ? (
                  <>
                    <img
                      ref={streamRef}
                      key={`stream-${streamUrl}-${filters.join("-")}`}
                      src={streamUrl}
                      alt={`Stream from ${camera.name}`}
                      className="w-full h-full object-fill"
                      style={{ display: isStreamActive ? "block" : "none" }}
                      onLoad={handleStreamLoad}
                      onError={handleStreamError}
                    />
                    {!isStreamActive && (
                      <div className="absolute inset-0 flex items-center justify-center text-neutral-500 bg-black">
                        {refreshing || (loading && !isStreamActive)
                          ? "Connecting to stream..."
                          : error
                          ? "Stream unavailable"
                          : "Initializing stream..."}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-500">
                    {loading
                      ? "Loading camera data..."
                      : !camera?.name
                      ? "Camera name missing."
                      : "Stream URL not available."}
                  </div>
                )}

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
              {editMode && (
                <div className="absolute inset-x-0 bottom-4 flex justify-center pointer-events-none">
                  <div className="bg-black/70 text-white px-4 py-2 rounded">
                    Click to add points. Minimum 3 points needed.
                  </div>
                </div>
              )}

              <div>
                <div className="flex justify-center mt-4">
                  <button
                    id="expandableButton"
                    onClick={(e) => {
                      const expandableDiv =
                        document.getElementById("expandableDiv");
                      const arrowIcon = e.currentTarget.querySelector("svg");

                      if (
                        expandableDiv.style.display === "none" ||
                        !expandableDiv.style.display
                      ) {
                        arrowIcon.classList.add("rotate-180");
                        expandableDiv.style.display = "block";
                      } else {
                        expandableDiv.style.display = "none";
                        arrowIcon.classList.remove("rotate-180");
                      }
                    }}
                    className="p-2 rounded-full flex bg-neutral-700 hover:bg-neutral-600 transition-transform duration-300"
                  >
                    <FiArrowDown size={20} className="mr-2" />
                    <p className="text-neutral-300">Select filters</p>
                  </button>
                </div>
                <div
                  id="expandableDiv"
                  style={{ display: "none" }}
                  className="mt-4 p-4 bg-neutral-800 rounded-lg"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                    {Object.entries(ppeImageMapping).map(([label, image]) => (
                      <div
                        key={label}
                        className="flex items-center bg-neutral-700 rounded p-3 shadow"
                      >
                        <img
                          src={image}
                          alt={label}
                          className="w-10 h-10 rounded bg-neutral-600 mr-3 object-cover"
                        />
                        <span className="flex-1 text-neutral-200">{label}</span>
                        <input
                          data-filter-label={label}
                          type="checkbox"
                          className="w-5 h-5 accent-cyan-600"
                          defaultChecked={filters.includes(label)}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-center">
                    <button
                      className="cursor-pointer mt-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 px-4 rounded"
                      onClick={handleSaveFilters}
                    >
                      Save Filters
                    </button>
                  </div>
                </div>
              </div>
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
                      isStreamActive && !error
                        ? "text-green-400"
                        : "text-red-400"
                    }
                  >
                    {isStreamActive && !error
                      ? "Active"
                      : error
                      ? "Error"
                      : "Inactive"}
                  </span>
                </p>
                <p className="flex justify-between py-2 border-b border-neutral-700">
                  <span className="text-neutral-400 flex items-center">
                    <FiGrid className="mr-2" />
                    RTSP URL:
                  </span>
                  <span className="font-mono text-xs break-all">
                    rtsp://{camera?.username}:
                    {camera?.password ? "********" : ""}@{camera?.ip}:
                    {camera?.port}/stream2
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
