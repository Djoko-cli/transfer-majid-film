import {
  Badge,
  Group,
  Stack,
  Text,
  UnstyledButton,
  createStyles,
} from "@mantine/core";
import useTranslate from "../../../hooks/useTranslate.hook";
import brandSlideService from "../../../services/brandSlide.service";
import { BrandCatalogProject } from "../../../types/brandSlide.type";

const useStyles = createStyles((theme) => ({
  row: {
    display: "block",
    width: "100%",
    padding: theme.spacing.xs,
    borderRadius: theme.radius.sm,
  },

  // Same selected-state treatment as AdminNavBar's own activeLink, so this
  // page's own navigation reads as the same kind of choice.
  activeRow: {
    backgroundColor: theme.fn.variant({
      variant: "light",
      color: theme.primaryColor,
    }).background,
  },

  thumb: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    objectFit: "cover",
    flexShrink: 0,
  },
}));

// Left pane of the brand-slide curation page — one row per project, a
// thumbnail (its first still) plus an N/M "how many of its stills are
// currently shown" badge computed from the disabled set the parent already
// fetched. Selecting a row loads that project into BrandStillGrid.
const BrandProjectList = ({
  projects,
  selectedSlug,
  onSelect,
  isDisabled,
}: {
  projects: BrandCatalogProject[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  isDisabled: (slug: string, still: number) => boolean;
}) => {
  const { classes, cx } = useStyles();
  const t = useTranslate();

  return (
    <Stack spacing={4}>
      {projects.map((project) => {
        const firstStill = project.stills[0];
        const enabledCount = project.stills.filter(
          (s) => !isDisabled(project.slug, s.still),
        ).length;
        const active = project.slug === selectedSlug;

        return (
          <UnstyledButton
            key={project.slug}
            onClick={() => onSelect(project.slug)}
            className={cx(classes.row, { [classes.activeRow]: active })}
          >
            <Group position="apart" noWrap>
              <Group noWrap spacing="sm" sx={{ minWidth: 0 }}>
                {firstStill && (
                  <img
                    className={classes.thumb}
                    src={brandSlideService.getImageUrl(
                      project.slug,
                      firstStill.still,
                      640,
                      "webp",
                    )}
                    alt=""
                  />
                )}
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" weight={600} truncate>
                    {project.title}
                  </Text>
                  <Text size="xs" color="dimmed">
                    {project.year}
                  </Text>
                </div>
              </Group>
              <Badge
                variant="light"
                color={
                  enabledCount === project.stills.length ? "gray" : "orange"
                }
              >
                {t("admin.brand.project.enabledCount", {
                  enabled: enabledCount,
                  total: project.stills.length,
                })}
              </Badge>
            </Group>
          </UnstyledButton>
        );
      })}
    </Stack>
  );
};

export default BrandProjectList;
