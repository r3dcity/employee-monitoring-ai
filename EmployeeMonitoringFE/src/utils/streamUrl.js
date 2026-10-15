import { SERVER_URL } from "./constants";

/**
 * Build the MJPEG stream URL for a camera.
 * Camera and filter names can contain spaces (e.g. "NO-Safety Vest"), so everything is encoded.
 *
 * @param {string} cameraName
 * @param {string} token
 * @param {string[]} filters - detector names and/or "face_recognition"
 * @param {number|string} [cacheBuster] - changes the URL to force the browser to reconnect
 */
export const buildStreamUrl = (cameraName, token, filters = [], cacheBuster) => {
  if (!cameraName || !token) return "";
  const params = new URLSearchParams({ token });
  filters.forEach((filter) => params.append(filter, "true"));
  if (cacheBuster !== undefined) params.append("t", String(cacheBuster));
  return `${SERVER_URL}/video-cameras/${encodeURIComponent(cameraName)}/stream?${params}`;
};
