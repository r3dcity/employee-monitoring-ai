import { useEffect, useRef, useState } from "react";
import { getPlayback } from "../../services/MainService";
import { SERVER_URL } from "../../utils/constants";
import { playWhep } from "../../utils/whep";
import { useLiveEvent } from "../../context/LiveEventsContext";

/**
 * Live video of one camera.
 *
 * 1. WebRTC from the MediaMTX relay when available: low latency, the original H.264 stream, no
 *    load on the API. Detection boxes arrive as live events and are drawn on a canvas on top.
 * 2. Otherwise the annotated MJPEG stream from the API (boxes are already drawn in the image).
 *
 * Children are rendered on top of the video (e.g. zone polygons). Coordinates are normalized,
 * which is why the video is stretched to the container (object-fill) instead of cropped.
 */
const CameraPlayer = ({ camera, showDetections = true, onStatusChange, children, className = "" }) => {
  const videoRef = useRef(null);
  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const [mode, setMode] = useState("loading"); // loading | webrtc | mjpeg | error
  const [mjpegUrl, setMjpegUrl] = useState("");
  const [attempt, setAttempt] = useState(0);
  const statusRef = useRef(onStatusChange);
  statusRef.current = onStatusChange;

  useEffect(() => {
    statusRef.current?.(mode === "webrtc" || mode === "mjpeg" ? "live" : mode);
  }, [mode]);

  useEffect(() => {
    if (!camera?.id) return undefined;
    let cancelled = false;
    let closeWebrtc = null;
    let retryTimer = null;
    const retry = () => {
      if (!cancelled) retryTimer = setTimeout(() => setAttempt((n) => n + 1), 5000);
    };

    (async () => {
      setMode("loading");
      try {
        const { data } = await getPlayback(camera.id);
        if (cancelled) return;
        if (data.webrtc && window.RTCPeerConnection) {
          try {
            closeWebrtc = await playWhep(data.webrtc, videoRef.current, {
              onDisconnect: () => {
                setMode("error");
                retry();
              },
            });
            if (cancelled) closeWebrtc();
            else setMode("webrtc");
            return;
          } catch (error) {
            console.warn("WebRTC unavailable, falling back to MJPEG:", error);
          }
        }
        setMjpegUrl(`${SERVER_URL}${data.mjpeg}`);
        setMode("mjpeg");
      } catch (error) {
        console.error("Could not start playback:", error);
        if (!cancelled) {
          setMode("error");
          retry();
        }
      }
    })();

    const img = imgRef.current;
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      closeWebrtc?.();
      // Closes the MJPEG connection right away instead of when the <img> is garbage collected
      if (img) img.src = "";
    };
  }, [camera?.id, attempt]);

  // Detection overlay for WebRTC (MJPEG frames already contain the boxes)
  useLiveEvent("detections", (data) => {
    if (mode !== "webrtc" || !showDetections || data.camera_id !== camera?.id) return;
    drawDetections(canvasRef.current, data);
  });

  return (
    <div className={`relative aspect-video bg-black overflow-hidden ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`absolute inset-0 w-full h-full object-fill ${mode === "webrtc" ? "" : "hidden"}`}
      />
      <img
        ref={imgRef}
        src={mode === "mjpeg" ? mjpegUrl : undefined}
        alt={camera ? `Live view of ${camera.name}` : ""}
        className={`absolute inset-0 w-full h-full object-fill ${mode === "mjpeg" ? "" : "hidden"}`}
        onError={() => {
          setMode("error");
          setTimeout(() => setAttempt((n) => n + 1), 5000);
        }}
      />
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full pointer-events-none ${mode === "webrtc" ? "" : "hidden"}`}
      />
      {(mode === "loading" || mode === "error") && (
        <div className="absolute inset-0 flex items-center justify-center text-neutral-400 text-sm">
          {mode === "loading" ? "Connecting to camera..." : "Camera unavailable, retrying..."}
        </div>
      )}
      {children}
    </div>
  );
};

function drawDetections(canvas, data) {
  if (!canvas) return;
  const { clientWidth: width, clientHeight: height } = canvas;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  ctx.lineWidth = 2;
  ctx.font = "12px sans-serif";

  const box = ([x1, y1, x2, y2], color, label) => {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.strokeRect(x1 * width, y1 * height, (x2 - x1) * width, (y2 - y1) * height);
    ctx.fillText(label, x1 * width + 2, Math.max(12, y1 * height - 4));
  };
  data.objects.forEach((o) =>
    box(o.bbox, o.class.startsWith("NO-") ? "#ef4444" : "#22c55e", `${o.class} #${o.id}`)
  );
  data.faces.forEach((f) => box(f.bbox, f.employee_id ? "#ffffff" : "#ef4444", f.name));
}

export default CameraPlayer;
