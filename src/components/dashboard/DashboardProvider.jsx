"use client";

import { apiFetch } from "@/lib/apiFetch";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ensureUserSetup } from "@/lib/userSetup";
import { navItems } from "@/lib/navigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNoticeDismissals } from "@/hooks/use-notice-dismissals";
import { getNoticeMonth, partitionNotices } from "@/lib/noticeDismissals";

const DashboardContext = createContext(null);
const appRoutes = new Set(navItems.map((item) => item.href));
const initialState = { dashboard: null, userId: null, isLoading: true, error: "" };

export function DashboardProvider({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const mobile = useIsMobile();
  const [state, setState] = useState(initialState);
  const [today, setToday] = useState(() => new Date());
  const [usageHistoryPeriod, setUsageHistoryPeriod] = useState("");
  const requestRef = useRef(null);
  const loadedRouteRef = useRef(null);
  const userIdRef = useRef(null);
  const generationRef = useRef(0);
  const noticePreferences = useNoticeDismissals({
    userId: state.userId,
    month: getNoticeMonth(today),
    enabled: appRoutes.has(pathname) && (mobile || pathname === "/dashboard" || pathname === "/analisis"),
  });
  const notices = partitionNotices(state.dashboard?.importantNotices || [], noticePreferences.entries, noticePreferences.month);

  const refresh = useCallback(async (options = {}) => {
    const generation = generationRef.current;
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (generation !== generationRef.current) return;
      if (error) throw error;
      if (!session) {
        setState(initialState);
        router.replace("/login");
        return;
      }
      const userId = session.user.id;
      if (!options.force && requestRef.current?.userId === userId) return requestRef.current.promise;

      const request = { userId, controller: new AbortController(), promise: null };
      requestRef.current?.controller.abort();
      requestRef.current = request;
      const sameUser = userIdRef.current === userId;
      userIdRef.current = userId;
      setState((previous) => ({
        userId,
        dashboard: sameUser ? previous.dashboard : null,
        isLoading: !sameUser || !previous.dashboard,
        error: "",
      }));

      request.promise = (async () => {
        try {
          await ensureUserSetup(session.user);
          if (request.controller.signal.aborted) return;
          const requestDate = new Date();
          const params = new URLSearchParams({ userId, clientDate: requestDate.toLocaleDateString("en-CA") });
          const response = await apiFetch(`/api/dashboard?${params}`, { signal: request.controller.signal });
          const dashboard = await response.json();
          if (!response.ok) throw new Error(dashboard.error || "No se pudo cargar la información.");
          if (!request.controller.signal.aborted) {
            setState({ dashboard, userId, isLoading: false, error: "" });
            setToday(requestDate);
          }
        } catch (err) {
          if (!request.controller.signal.aborted) {
            setState((previous) => ({ ...previous, isLoading: false, error: err.message || "No se pudo cargar la información." }));
          }
        } finally {
          if (requestRef.current === request) requestRef.current = null;
        }
      })();
      return request.promise;
    } catch (err) {
      if (generation === generationRef.current) {
        setState((previous) => ({ ...previous, isLoading: false, error: err.message || "No se pudo cargar la información." }));
      }
    }
  }, [router]);

  useEffect(() => {
    if (!appRoutes.has(pathname) || (!mobile && pathname !== "/dashboard" && pathname !== "/analisis")) return;
    const nextDay = new Date();
    nextDay.setHours(24, 0, 0, 0);
    const timer = window.setTimeout(() => {
      setToday(new Date());
      refresh();
    }, nextDay.getTime() - Date.now() + 100);
    return () => window.clearTimeout(timer);
  }, [pathname, mobile, today, refresh]);

  useEffect(() => {
    if (!appRoutes.has(pathname) || (!mobile && pathname !== "/dashboard" && pathname !== "/analisis")) return;
    if (loadedRouteRef.current !== pathname) {
      loadedRouteRef.current = pathname;
      refresh();
    }
    const onFocus = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [pathname, mobile, refresh]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || (session && userIdRef.current && session.user.id !== userIdRef.current)) {
        generationRef.current += 1;
        requestRef.current?.controller.abort();
        requestRef.current = null;
        userIdRef.current = null;
        loadedRouteRef.current = null;
        setState(initialState);
        setUsageHistoryPeriod("");
        if (event === "SIGNED_OUT") router.replace("/login");
      }
    });
    return () => {
      subscription.unsubscribe();
      generationRef.current += 1;
      requestRef.current?.controller.abort();
      requestRef.current = null;
      loadedRouteRef.current = null;
    };
  }, [router]);

  const value = useMemo(() => ({
    ...state, refresh, retry: refresh, today,
    usageHistoryPeriod, setUsageHistoryPeriod,
    noticePreferences, visibleNotices: notices.visible, hiddenNotices: notices.hidden,
  }), [state, refresh, today, usageHistoryPeriod, noticePreferences, notices.visible, notices.hidden]);

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) throw new Error("useDashboard requiere DashboardProvider.");
  return context;
}
