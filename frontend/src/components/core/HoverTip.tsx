import { Tooltip } from "@mantine/core";
import type { ReactNode } from "react";

type HoverTipProps = {
  label: string;
  children: ReactNode;
  disabled?: boolean;
};

export const HoverTip = ({ label, children, disabled }: HoverTipProps) => {
  return (
    <Tooltip
      position="bottom"
      events={{ hover: true, focus: true, touch: true }}
      label={label}
      disabled={disabled}
      // Mantine's Tooltip renders inline by default (withinPortal: false),
      // so any ancestor with overflow:auto/hidden — e.g. the scrollable
      // Paper wrapping "Mes partages"' table — silently clips it. HoverTip
      // is used for exactly these small action-icon labels across several
      // scrollable tables, so this needs fixing once here rather than per
      // call site.
      withinPortal
    >
      {children}
    </Tooltip>
  );
};
