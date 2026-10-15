import React, { useState } from "react";
import { FiMapPin, FiServer, FiWifi } from "react-icons/fi";
import CameraPlayer from "./CameraPlayer";
import { useInView } from "../../hooks/useInView";

/**
 * Component for displaying a video camera feed with status indicators
 *
 * @param {Object} camera - Camera object with properties: id, name, location, status, ip, port
 * @param {boolean} detailed - Whether to show detailed information (true) or compact view (false)
 * @param {function} onClickHandler - Function to call when the camera is clicked
 */
const VideoCameraFeed = ({
  camera,
  detailed = true,
  onClickHandler,
}) => {
  const [playerStatus, setPlayerStatus] = useState("loading");
  const [visibleRef, inView] = useInView();
  const isLive = inView && playerStatus === "live";

  return (
    <div
      className={`
        relative overflow-hidden rounded-lg shadow-lg
        ${detailed ? "bg-neutral-800" : "bg-neutral-900"}
        transition-all duration-300
        flex flex-col
      `}
      onClick={onClickHandler ? () => onClickHandler(camera) : undefined}
    >
      {/* Header with name and status */}
      <div className="flex justify-between items-center pl-2 pt-2">
        <h3
          className={`${
            detailed ? "text-base" : "text-sm"
          } font-semibold truncate`}
        >
          {camera.name}
        </h3>
      </div>

      {/* Camera Feed */}
      <div className="mt-2 mx-2 border border-black" ref={visibleRef}>
        {inView ? (
          <CameraPlayer camera={camera} onStatusChange={setPlayerStatus} />
        ) : (
          <div className="aspect-video bg-black" />
        )}
      </div>

      {/* Camera Info */}

      {detailed ? (
        <div className="p-3 flex-grow flex flex-col justify-between">
          <div className="">
            <div className="flex justify-between">
              <div className="flex items-center text-sm text-neutral-400 truncate mb-2">
                <FiMapPin className="mr-1 flex-shrink-0" size={14} />
                <span className="truncate">
                  {camera.location || "No location specified"}
                </span>
              </div>
              <div
                className={`
            px-2 py-1 rounded-md text-xs font-medium flex items-center
            ${
              isLive
                ? "bg-green-500 text-green-900"
                : "bg-red-500 text-red-900"
            }
          `}
              >
                <span
                  className={`mr-1 w-2 h-2 rounded-full ${
                    isLive ? "bg-green-900 animate-pulse" : "bg-red-900"
                  }`}
                ></span>
                {isLive ? "LIVE" : "OFFLINE"}
              </div>

            </div>


            {/* Camera connection details - single line */}
            <div className="flex items-center justify-between text-xs text-neutral-400 border-t border-neutral-700 pt-2 mt-2">
              <div className="flex items-center">
                <FiServer className="mr-1 flex-shrink-0" />
                <span className="font-mono truncate">{camera.ip || "N/A"}</span>
              </div>
              <div className="flex items-center ml-2">
                <FiWifi className="mr-1 flex-shrink-0" />
                <span className="font-mono">{camera.port || "N/A"}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Minimal info for compact view
        <div className="px-2 pb-2 text-xs text-neutral-400 flex items-center">
          <FiMapPin className="mr-1 flex-shrink-0" size={12} />
          <span className="truncate">{camera.location || "No location"}</span>
        </div>
      )}
    </div>
  );
};

export default VideoCameraFeed;
