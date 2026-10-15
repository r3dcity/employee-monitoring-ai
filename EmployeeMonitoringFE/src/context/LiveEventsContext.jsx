import { createContext, useContext, useEffect, useRef } from "react";
import { getEventsUrl } from "../services/MainService";
import { SERVER_URL } from "../utils/constants";
import { useUser } from "./UserContext";

/**
 * One Server-Sent Events connection per browser tab, shared by every component.
 *
 * Event types: "alert", "camera_status", "detections" (boxes for the video overlays).
 * EventSource cannot send an Authorization header, so the URL carries a ticket that expires
 * after a minute; when the connection drops we fetch a new ticket and reconnect.
 */
const LiveEventsContext = createContext(null);

export const LiveEventsProvider = ({ children }) => {
  const { token } = useUser();
  const listeners = useRef(new Set());

  useEffect(() => {
    if (!token) return undefined;
    let source = null;
    let retryTimer = null;
    let closed = false;

    const dispatch = (type) => (event) => {
      const data = JSON.parse(event.data);
      listeners.current.forEach((listener) => {
        if (listener.type === type) listener.handler(data);
      });
    };

    const connect = async () => {
      try {
        const url = await getEventsUrl();
        if (closed) return;
        source = new EventSource(`${SERVER_URL}${url}&cameras=all`);
        ["alert", "camera_status", "detections"].forEach((type) =>
          source.addEventListener(type, dispatch(type))
        );
        source.onerror = () => {
          source.close();
          if (!closed) retryTimer = setTimeout(connect, 3000);
        };
      } catch {
        if (!closed) retryTimer = setTimeout(connect, 5000);
      }
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(retryTimer);
      source?.close();
    };
  }, [token]);

  const subscribe = (type, handler) => {
    const listener = { type, handler };
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  };

  return (
    <LiveEventsContext.Provider value={subscribe}>
      {children}
    </LiveEventsContext.Provider>
  );
};

/** Call `handler(data)` for every live event of `type` while the component is mounted. */
export const useLiveEvent = (type, handler) => {
  const subscribe = useContext(LiveEventsContext);
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!subscribe) return undefined;
    return subscribe(type, (data) => handlerRef.current(data));
  }, [subscribe, type]);
};
