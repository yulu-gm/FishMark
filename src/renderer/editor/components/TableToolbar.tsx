import type { WorkspaceShellProps } from "../workspace-shell-props";
type TableToolTone = "default" | "danger";
type TableToolAction = {
  id: string;
  label: string;
  tone: TableToolTone;
  paths: string[];
  onClick: () => void;
};

function createTableToolActions({
  onDeleteTable,
  onDeleteTableColumn,
  onDeleteTableRow,
  onInsertTableColumnLeft,
  onInsertTableColumnRight,
  onInsertTableRowAbove,
  onInsertTableRowBelow
}: Pick<
  WorkspaceShellProps,
  | "onDeleteTable"
  | "onDeleteTableColumn"
  | "onDeleteTableRow"
  | "onInsertTableColumnLeft"
  | "onInsertTableColumnRight"
  | "onInsertTableRowAbove"
  | "onInsertTableRowBelow"
>): TableToolAction[] {
  return [
    {
      id: "row-above",
      label: "Row Above",
      tone: "default",
      paths: ["M12 3v4M10 5h4M4 9h16M4 9v11M20 9v11M8 9v11M16 9v11M4 14.5h16"],
      onClick: onInsertTableRowAbove
    },
    {
      id: "row-below",
      label: "Row Below",
      tone: "default",
      paths: ["M4 4h16M4 4v11M20 4v11M8 4v11M16 4v11M4 9.5h16M12 17v4M10 19h4"],
      onClick: onInsertTableRowBelow
    },
    {
      id: "column-left",
      label: "Column Left",
      tone: "default",
      paths: ["M4 4h14M4 20h14M8 4v16M13 4v16M18 4v16M2 12h4M4 10v4"],
      onClick: onInsertTableColumnLeft
    },
    {
      id: "column-right",
      label: "Column Right",
      tone: "default",
      paths: ["M6 4h14M6 20h14M6 4v16M11 4v16M16 4v16M18 12h4M20 10v4"],
      onClick: onInsertTableColumnRight
    },
    {
      id: "delete-row",
      label: "Delete Row",
      tone: "danger",
      paths: ["M4 4h16M4 4v16M20 4v16M8 4v16M16 4v16M4 9.5h16M9 14.5h6", "M18 12l3 3M21 12l-3 3"],
      onClick: onDeleteTableRow
    },
    {
      id: "delete-column",
      label: "Delete Column",
      tone: "danger",
      paths: ["M4 4h16M4 20h16M4 4v16M9 4v16M14 4v16M4 9.5h16M4 14.5h16", "M17 3l3 3M20 3l-3 3"],
      onClick: onDeleteTableColumn
    },
    {
      id: "delete-table",
      label: "Delete Table",
      tone: "danger",
      paths: ["M5 5h14M5 5v14M19 5v14M9.5 5v14M14.5 5v14M5 9.5h14M5 14.5h14", "M7 7l10 10M17 7L7 17"],
      onClick: onDeleteTable
    }
  ];
}


export function TableToolbar({
  activeTableToolId,
  onTableToolHoverChange,
  onDeleteTable,
  onDeleteTableColumn,
  onDeleteTableRow,
  onInsertTableColumnLeft,
  onInsertTableColumnRight,
  onInsertTableRowAbove,
  onInsertTableRowBelow
}: Pick<WorkspaceShellProps, "activeTableToolId" | "onTableToolHoverChange" | "onDeleteTable" | "onDeleteTableColumn" | "onDeleteTableRow" | "onInsertTableColumnLeft" | "onInsertTableColumnRight" | "onInsertTableRowAbove" | "onInsertTableRowBelow">) {
  const tableToolActions = createTableToolActions({
    onDeleteTable,
    onDeleteTableColumn,
    onDeleteTableRow,
    onInsertTableColumnLeft,
    onInsertTableColumnRight,
    onInsertTableRowAbove,
    onInsertTableRowBelow
  });

  return (
    <div className="table-tool-strip" data-fishmark-region="table-tool-strip">
      {tableToolActions.map((action) => {
        const isTooltipVisible = activeTableToolId === action.id;

        return (
          <button
            key={action.id}
            type="button"
            className="table-tool-button"
            data-tone={action.tone}
            data-fishmark-region="table-tool-button"
            aria-label={action.label}
            onClick={action.onClick}
            onMouseEnter={() => onTableToolHoverChange(action.id)}
            onMouseLeave={() => onTableToolHoverChange(null)}
            onFocus={() => onTableToolHoverChange(action.id)}
            onBlur={() => onTableToolHoverChange(null)}
          >
            <svg className="table-tool-button-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none">
              {action.paths.map(path => <path key={path} d={path} />)}
            </svg>
            {isTooltipVisible ? (
              <span
                className="table-tool-tooltip"
                data-fishmark-region="table-tool-tooltip"
                role="tooltip"
              >
                {action.label}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>

  );
}
