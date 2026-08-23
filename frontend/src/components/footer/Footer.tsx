import { Anchor, Footer as MFooter, SimpleGrid, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useEffect, useRef } from "react";
import useConfig from "../../hooks/config.hook";
import useTranslate from "../../hooks/useTranslate.hook";

const Footer = () => {
  const t = useTranslate();
  const config = useConfig();
  // Published as a CSS var (rather than prop-drilled) so pages that need to
  // reserve room for the footer — e.g. SplitTransferLayout, which lives
  // several components away with no shared parent — can read the real,
  // current height instead of guessing a fixed one. The footer's own height
  // isn't constant: it grows when legal links wrap to a second line at
  // narrow-but-not-mobile widths, when a locale's text runs longer, etc.
  // Uses `offsetHeight` (border-box, matching the space the footer actually
  // occupies in flow) rather than @mantine/hooks' useElementSize, which
  // reports ResizeObserver's contentRect — the content box only, excluding
  // this element's own vertical padding, and so undercounts its real height.
  const footerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = footerRef.current;
    if (!el) return;

    const publishHeight = () => {
      document.documentElement.style.setProperty(
        "--footer-height",
        `${el.offsetHeight}px`,
      );
    };
    publishHeight();

    const observer = new ResizeObserver(publishHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const hasImprint = !!(
    config.get("legal.imprintUrl") || config.get("legal.imprintText")
  );
  const hasPrivacy = !!(
    config.get("legal.privacyPolicyUrl") ||
    config.get("legal.privacyPolicyText")
  );
  const imprintUrl =
    (!config.get("legal.imprintText") && config.get("legal.imprintUrl")) ||
    "/imprint";
  const privacyUrl =
    (!config.get("legal.privacyPolicyText") &&
      config.get("legal.privacyPolicyUrl")) ||
    "/privacy";

  const isMobile = useMediaQuery("(max-width: 700px)");

  return (
    <MFooter ref={footerRef} height="auto" py={6} px="xl" zIndex={100}>
      {!config.get("legal.enabled") && (
        <Text size="xs" color="dimmed" align="center">
          {config.get("general.appName")} ·{" "}
          <Anchor size="xs" href="https://majid.film" target="_blank">
            majid.film
          </Anchor>
        </Text>
      )}
      {config.get("legal.enabled") && (
        <SimpleGrid cols={isMobile ? 2 : 3} m={0}>
          {!isMobile && <div></div>}
          <Text size="xs" color="dimmed" align={isMobile ? "left" : "center"}>
            {config.get("general.appName")} ·{" "}
            <Anchor size="xs" href="https://majid.film" target="_blank">
              majid.film
            </Anchor>
          </Text>
          <div>
            <Text size="xs" color="dimmed" align="right">
              {hasImprint && (
                <Anchor size="xs" href={imprintUrl}>
                  {t("imprint.title")}
                </Anchor>
              )}
              {hasImprint && hasPrivacy && " • "}
              {hasPrivacy && (
                <Anchor size="xs" href={privacyUrl}>
                  {t("privacy.title")}
                </Anchor>
              )}
            </Text>
          </div>
        </SimpleGrid>
      )}
    </MFooter>
  );
};

export default Footer;
