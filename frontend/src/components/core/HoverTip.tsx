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
      // Capped, and allowed to wrap. This component carries two very
      // different kinds of label: a two-word action name on an icon, and a
      // whole sentence explaining a feature. Uncapped, the sentence renders
      // as a single line wider than a phone and is simply cut off at the
      // viewport edge — floating-ui can shift a tooltip back into view, but
      // not one that is wider than the view itself. The cap only binds on
      // the long ones; a short label keeps its natural width.
      styles={{
        tooltip: {
          maxWidth: "min(320px, calc(100vw - 32px))",
          whiteSpace: "normal",
        },
      }}
      // Mantine's Tooltip renders inline by default (withinPortal: false),
      // so any ancestor with overflow:auto/hidden — e.g. the scrollable
      // Paper wrapping "Mes transferts"' table — silently clips it. HoverTip
      // is used for exactly these small action-icon labels across several
      // scrollable tables, so this needs fixing once here rather than per
      // call site.
      withinPortal
    >
      {children}
    </Tooltip>
  );
};
