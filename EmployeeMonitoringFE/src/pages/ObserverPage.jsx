import React, { useState, useEffect } from "react";
import Sidebar from "../components/layout/Sidebar";
import { getCamerasList } from "../services/MainService";
import { useUser } from "../context/UserContext";
import { FiEye, FiEyeOff } from "react-icons/fi";
import VideoCameraFeed from "../components/video/VideoCameraFeed";
import { useAppData } from "../context/AppDataContext";

const ObserverPage = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [focusedCamera, setFocusedCamera] = useState(null);
  const { token } = useUser();
  const {cameras, setCameras} = useAppData();

  useEffect(() => {
    const fetchCameras = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await getCamerasList();
        setCameras(response.data.cameras || []);
      } catch (err) {
        console.error("Failed to fetch cameras:", err);
        setError("Failed to load camera list. Please try again later.");
        setCameras([]);
      } finally {
        setLoading(false);
      }
    };
    if(token) {
      if(cameras.length === 0) {
        fetchCameras();
      } else {
        setLoading(false);
        setError(null);
      }
    } else {
      setError("Authentication token not found. Please log in.");
      setLoading(false);
    }

  }, [token]);

  const toggleDetails = () => {
    setShowDetails(!showDetails);
  };

  const handleCameraClick = (camera) => {
    // Toggle focused state
    if (focusedCamera && focusedCamera.id === camera.id) {
      setFocusedCamera(null);
    } else {
      setFocusedCamera(camera);
    }
  };

  // Define grid layout
  const getGridClass = () => {
    if (focusedCamera) {
      return "grid grid-cols-1 gap-4";
    }

    return "grid grid-cols-1 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2";
  };

  return (
    <div className="flex h-screen bg-neutral-900 text-white">
      <Sidebar />
      <main className="flex-1 p-6 md:p-8 lg:p-10 md:pt-6 lg:pt-6 overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-semibold">Observer Mode</h1>

          {/* Details Toggle Control */}
          <button
            onClick={toggleDetails}
            className={`p-2 rounded flex items-center bg-cyan-600 hover:bg-cyan-500 transition-colors`}
            title={showDetails ? "Hide details" : "Show details"}
          >
            {showDetails ? (
              <>
                <FiEyeOff className="mr-2" /> Hide Details
              </>
            ) : (
              <>
                <FiEye className="mr-2" /> Show Details
              </>
            )}
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-xl text-neutral-400">Loading cameras...</div>
          </div>
        ) : error ? (
          <div
            className="bg-red-800 border border-red-600 text-red-100 px-4 py-3 rounded relative mb-6"
            role="alert"
          >
            <strong className="font-bold">Error:</strong>
            <span className="block sm:inline"> {error}</span>
          </div>
        ) : cameras.length === 0 ? (
          <div className="text-center py-10 text-neutral-500">
            No cameras found or available.
          </div>
        ) : (
          <div className="w-full">
            {focusedCamera ? (
              // Focused camera layout - centered at top with other cameras below
              <>
                <div className="w-full mb-4 max-w-5xl mx-auto">
                  <VideoCameraFeed
                    camera={focusedCamera}
                    detailed={showDetails}
                    onClickHandler={handleCameraClick}
                  />
                </div>

                {/* Other cameras in grid below */}
                <div className={getGridClass()}>
                  {cameras
                    .filter((cam) => cam.id !== focusedCamera.id)
                    .map((camera) => (
                      <VideoCameraFeed
                        key={camera.id}
                        camera={camera}
                        detailed={false}
                        onClickHandler={handleCameraClick}
                      />
                    ))}
                </div>
              </>
            ) : (
              // All cameras in grid - larger view
              <div className={getGridClass()}>
                {cameras.map((camera) => (
                  <VideoCameraFeed
                    key={camera.id}
                    camera={camera}
                    detailed={showDetails}
                    onClickHandler={handleCameraClick}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

export default ObserverPage;
