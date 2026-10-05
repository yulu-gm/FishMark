import type { ReactNode } from "react";
type SettingsGroupProps = {
  title: ReactNode;
  description: ReactNode;
  children: ReactNode;
  panel?: string;
  themeId?: string;
};

export function SettingsGroup({ title, description, children, panel, themeId }: SettingsGroupProps) {
  return (
    <section
      className="settings-group"
      data-fishmark-panel={panel}
      data-fishmark-theme-id={themeId}
    >
      <header className="settings-group-header">
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
      {children}
    </section>
  );
}

type SettingsRowProps = {
  children: ReactNode;
};

export function SettingsRow({ children }: SettingsRowProps) {
  return <div className="settings-row">{children}</div>;
}
