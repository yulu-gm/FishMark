import { useCallback, useEffect, useRef, useState } from "react";
import type { AppNotification } from "../../shared/app-update";
type AppNotificationBannerState = "hidden" | "open" | "closing";
const APP_NOTIFICATION_DURATION_MS = 3000;
const APP_NOTIFICATION_EXIT_ANIMATION_MS = 180;

export function useNotificationPresentation() {
  const [notification, setNotification] = useState<AppNotification | null>(null);
  const [notificationState, setNotificationState] = useState<AppNotificationBannerState>("hidden");
  const notificationHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notificationCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearNotificationTimers = useCallback((): void => {
    if (notificationHideTimerRef.current !== null) {
      clearTimeout(notificationHideTimerRef.current);
      notificationHideTimerRef.current = null;
    }

    if (notificationCloseTimerRef.current !== null) {
      clearTimeout(notificationCloseTimerRef.current);
      notificationCloseTimerRef.current = null;
    }
  }, []);

  const showNotification = useCallback((nextNotification: AppNotification): void => {
    clearNotificationTimers();
    setNotification(nextNotification);
    setNotificationState("open");

    if (nextNotification.kind === "loading") {
      return;
    }

    notificationHideTimerRef.current = setTimeout(() => {
      notificationHideTimerRef.current = null;
      setNotificationState("closing");
      notificationCloseTimerRef.current = setTimeout(() => {
        notificationCloseTimerRef.current = null;
        setNotificationState("hidden");
        setNotification(null);
      }, APP_NOTIFICATION_EXIT_ANIMATION_MS);
    }, APP_NOTIFICATION_DURATION_MS);
  }, [clearNotificationTimers]);

  useEffect(() => clearNotificationTimers, [clearNotificationTimers]);

  return { notification, notificationState, showNotification };
}
