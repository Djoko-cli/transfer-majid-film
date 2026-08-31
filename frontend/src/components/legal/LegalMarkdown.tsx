import { Anchor, useMantineTheme } from "@mantine/core";
import Markdown from "markdown-to-jsx";

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
