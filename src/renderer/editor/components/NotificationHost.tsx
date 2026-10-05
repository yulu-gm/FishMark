import type { WorkspaceShellProps } from "../workspace-shell-props";

export function NotificationHost({
  notification,
  notificationState
}: Pick<WorkspaceShellProps, "notification" | "notificationState">) {

  return (
    notification && notificationState !== "hidden" ? (
      <div
        className={`app-notification-banner is-${notification.kind}`}
        data-fishmark-region="app-notification-banner"
        data-state={notificationState}
        role="status"
        aria-live="polite"
      >
        <p className="app-notification-message">
          {notification.kind === "loading" ? (
            <span
              className="app-notification-spinner"
              data-fishmark-region="app-notification-spinner"
              aria-hidden="true"
            />
          ) : null}
          <span>{notification.message}</span>
        </p>
      </div>
    ) : null
  );
}
