import { useEffect, useState } from "react";
import { Link } from "react-router";
import { FiAlertTriangle, FiX } from "react-icons/fi";
import { useLiveEvent } from "../../context/LiveEventsContext";

const LEVEL_STYLES = {
  high: "border-red-500 bg-red-950/90",
  medium: "border-amber-500 bg-amber-950/90",
  low: "border-cyan-500 bg-neutral-800/95",
};
const TOAST_MS = 8000;

/** Pops up every new alert as it is raised by a camera worker, on every page. */
const AlertToasts = () => {
  const [toasts, setToasts] = useState([]);

  useLiveEvent("alert", (alert) => {
    setToasts((current) => [...current.slice(-3), { ...alert, shownAt: Date.now() }]);
  });

  useEffect(() => {
    if (toasts.length === 0) return undefined;
    const timer = setInterval(() => {
      setToasts((current) => current.filter((t) => Date.now() - t.shownAt < TOAST_MS));
    }, 1000);
    return () => clearInterval(timer);
  }, [toasts.length]);

  const dismiss = (id) => setToasts((current) => current.filter((t) => t.id !== id));

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80" aria-live="polite">
      {toasts.map((alert) => (
        <div
          key={alert.id}
          className={`border-l-4 rounded-md shadow-lg p-3 text-sm text-white ${LEVEL_STYLES[alert.level] || LEVEL_STYLES.low}`}
        >
          <div className="flex items-start">
            <FiAlertTriangle className="mt-0.5 mr-2 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{alert.explanation || "New alert"}</p>
              <p className="text-neutral-300 truncate">
                {alert.camera_name || "Unknown camera"} · {alert.type?.replaceAll("_", " ")}
              </p>
              <Link to={`/alerts/${alert.id}`} className="text-cyan-400 hover:underline" onClick={() => dismiss(alert.id)}>
                View alert
              </Link>
            </div>
            <button onClick={() => dismiss(alert.id)} className="text-neutral-400 hover:text-white" aria-label="Dismiss">
              <FiX />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AlertToasts;
