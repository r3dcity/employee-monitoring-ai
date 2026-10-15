import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLiveEvent } from "../context/LiveEventsContext";
import { getAlerts, getAllEmployees, getAllSecurity, getCamerasList } from "./MainService";

/**
 * Server state lives in TanStack Query: one cache shared by every page (no refetch on every
 * navigation, no stale copies in context), loading/error states for free, and live events
 * simply invalidate what changed.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export const queryKeys = {
  cameras: ["cameras"],
  alerts: (params = {}) => ["alerts", params],
  employees: ["employees"],
  security: ["security"],
};

export const useCameras = () =>
  useQuery({
    queryKey: queryKeys.cameras,
    queryFn: async () => (await getCamerasList()).data.cameras || [],
  });

export const useAlerts = (params = {}) =>
  useQuery({
    queryKey: queryKeys.alerts(params),
    queryFn: async () => (await getAlerts(params)).data.alerts || [],
  });

export const useEmployees = (enabled = true) =>
  useQuery({
    queryKey: queryKeys.employees,
    queryFn: async () => (await getAllEmployees()).data || [],
    enabled,
  });

export const useSecurityGuards = (enabled = true) =>
  useQuery({
    queryKey: queryKeys.security,
    queryFn: async () => (await getAllSecurity()).data || [],
    enabled,
  });

/** Keep cached data in sync with what the camera workers report. */
export const useLiveInvalidation = () => {
  const client = useQueryClient();
  useLiveEvent("alert", () => client.invalidateQueries({ queryKey: ["alerts"] }));
  useLiveEvent("camera_status", () => client.invalidateQueries({ queryKey: queryKeys.cameras }));
};
