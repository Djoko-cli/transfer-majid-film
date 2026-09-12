import { Anchor, useMantineTheme } from "@mantine/core";
import Markdown from "markdown-to-jsx";
import { ComponentPropsWithoutRef } from "react";

// A Markdown table is the one element an admin can author that has no upper
// width: enough columns, or one long cell, and it pushes the whole document
// wider than the screen. That does not read as a wide table, it reads as a
// broken page — every paragraph gains a horizontal scrollbar and the text
// runs off the edge. Measured on the privacy page at 498px of table against
// a 390px phone.
//
// Wrapping it lets the table keep its natural width and scroll inside its
// own box, which is the rule this codebase already follows everywhere wide
// content meets a narrow screen: the page body never scrolls sideways.
const ScrollableTable = (props: ComponentPropsWithoutRef<"table">) => (
  <div className="md-table-scroll">
    <table {...props} />
  </div>
);

// The one rendering path for admin-authored legal Markdown (imprintText /
// privacyPolicyText) — used by both public pages (pages/imprint,
// pages/privacy) and the admin editor's live preview (LegalContentEditor).
// Factored out so the two can never drift apart: the preview an admin sees
// while typing is produced by the exact same component that renders the
// real public page, not a lookalike with its own copy of these options.
const LegalMarkdown = ({ content }: { content: string }) => {
  const { colorScheme } = useMantineTheme();
  return (
    <Markdown
      options={{
        forceBlock: true,
        overrides: {
          pre: {
            props: {
              style: {
                backgroundColor:
                  colorScheme == "dark"
                    ? "rgba(50, 50, 50, 0.5)"
                    : "rgba(220, 220, 220, 0.5)",
                padding: "0.75em",
                whiteSpace: "pre-wrap",
              },
            },
          },
          table: {
            component: ScrollableTable,
            props: {
              className: "md",
            },
          },
          a: {
            props: {
              target: "_blank",
              rel: "noreferrer",
            },
            component: Anchor,
          },
        },
      }}
    >
      {content}
    </Markdown>
  );
};

export default LegalMarkdown;
