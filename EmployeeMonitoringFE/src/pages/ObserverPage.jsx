import React, { useState } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";
import VideoCameraFeed from "../components/video/VideoCameraFeed";
import { useCameras } from "../services/queries";

const ObserverPage = () => {
  const [showDetails, setShowDetails] = useState(false);
  const [focusedId, setFocusedId] = useState(null);
  const { data: cameras = [], isLoading, error } = useCameras();

  const handleCameraClick = (camera) => {
    setFocusedId((current) => (current === camera.id ? null : camera.id));
  };

  return (
    <div className="flex h-full bg-neutral-900 text-white">
      <main className="flex-1 p-6 md:p-8 lg:p-10 md:pt-6 lg:pt-6 overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-semibold">Observer Mode</h1>

          <button
            onClick={() => setShowDetails((value) => !value)}
            className="p-2 rounded flex items-center bg-cyan-600 hover:bg-cyan-500 transition-colors"
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

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-xl text-neutral-400">Loading cameras...</div>
          </div>
        ) : error ? (
          <div
            className="bg-red-800 border border-red-600 text-red-100 px-4 py-3 rounded relative mb-6"
            role="alert"
          >
            <strong className="font-bold">Error:</strong>
            <span className="block sm:inline"> Failed to load camera list. Please try again later.</span>
          </div>
        ) : cameras.length === 0 ? (
          <div className="text-center py-10 text-neutral-500">No cameras found or available.</div>
        ) : (
          // One list for all tiles: focusing a camera only changes its CSS (order and size), so
          // its video keeps playing instead of reconnecting. Tiles scrolled off screen disconnect.
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2">
            {cameras.map((camera) => {
              const focused = camera.id === focusedId;
              return (
                <div
                  key={camera.id}
                  className={focused ? "order-first lg:col-span-2 xl:col-span-3 w-full max-w-5xl mx-auto mb-2" : ""}
                >
                  <VideoCameraFeed
                    camera={camera}
                    detailed={focused || showDetails}
                    onClickHandler={handleCameraClick}
                  />
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default ObserverPage;
