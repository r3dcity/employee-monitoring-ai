import React, { useState, useEffect, useRef } from "react";
import { FiRefreshCw, FiMapPin, FiServer, FiWifi } from "react-icons/fi";
import { useUser } from "../../context/UserContext";
import { buildStreamUrl } from "../../utils/streamUrl";

/**
 * Component for displaying a video camera feed with status indicators
 *
 * @param {Object} camera - Camera object with properties: id, name, location, status, ip, port
 * @param {boolean} detailed - Whether to show detailed information (true) or compact view (false)
 * @param {function} onClickHandler - Function to call when the camera is clicked
 * @param {number} streamKey - Changing it forces the stream to reconnect (optional)
 */
const VideoCameraFeed = ({
  camera,
  detailed = true,
  onClickHandler,
  streamKey,
}) => {
  const [isStreamLoading, setIsStreamLoading] = useState(true);
  const [streamError, setStreamError] = useState(false);
  const [streamUrl, setStreamUrl] = useState("");
  const imgRef = useRef(null);
  const { token } = useUser();

  // Generate stream URL when component mounts or when streamKey changes.
  // The cache buster makes the browser open a new connection instead of reusing the old one.
  useEffect(() => {
    if (camera && camera.name && token) {
      setIsStreamLoading(true);
      setStreamError(false);
      setStreamUrl(buildStreamUrl(camera.name, token, [], streamKey));
    }
  }, [camera, token, streamKey]);

  // Browsers keep downloading an MJPEG stream from a removed <img> until it is garbage
  // collected; clearing src closes the connection right away.
  useEffect(() => {
    const img = imgRef.current;
    return () => {
      if (img) img.src = "";
    };
  }, []);

  const handleStreamLoad = () => {
    setIsStreamLoading(false);
    setStreamError(false);
  };

  const handleStreamError = () => {
    setIsStreamLoading(false);
    setStreamError(true);
  };

  const reloadStream = (e) => {
    e.stopPropagation(); // Prevent triggering the parent's onClick
    setIsStreamLoading(true);
    setStreamError(false);
    setStreamUrl(buildStreamUrl(camera.name, token, [], Date.now()));
  };

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
      <div className="relative aspect-video bg-black border border-black overflow-hidden mt-2 mx-2">
        {/* Loading state */}
        {isStreamLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
            <div className="text-neutral-400">Loading stream...</div>
          </div>
        )}

        {/* Image Stream */}
        {streamUrl && (
          <img
            ref={imgRef}
            id={`stream-${camera.id}`}
            src={streamUrl}
            alt={`Stream from ${camera.name}`}
            className={`w-full h-full object-cover ${
              streamError ? "hidden" : ""
            }`}
            onLoad={handleStreamLoad}
            onError={handleStreamError}
          />
        )}

        {/* Error Overlay */}
        {streamError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900">
            <div className="text-neutral-400 mb-3">Stream unavailable</div>
            <button
              onClick={reloadStream}
              className="bg-neutral-700 text-white px-3 py-2 rounded-md hover:bg-neutral-600 transition-colors flex items-center"
            >
              <FiRefreshCw className="mr-2" /> Reload
            </button>
          </div>
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
              !isStreamLoading
                ? "bg-green-500 text-green-900"
                : "bg-red-500 text-red-900"
            }
          `}
              >
                <span
                  className={`mr-1 w-2 h-2 rounded-full ${
                    !isStreamLoading ? "bg-green-900 animate-pulse" : "bg-red-900"
                  }`}
                ></span>
                {!isStreamLoading ? "LIVE" : "OFFLINE"}
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
