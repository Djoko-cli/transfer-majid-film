import {
  Badge,
  Group,
  Stack,
  Text,
  UnstyledButton,
  createStyles,
} from "@mantine/core";
import useTranslate from "../../../hooks/useTranslate.hook";
import {
  BrandProject,
  getProjectStillNumbers,
} from "../../../data/brandProjects";

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
  projects: BrandProject[];
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
  isDisabled: (slug: string, still: number) => boolean;
}) => {
  const { classes, cx } = useStyles();
  const t = useTranslate();

  return (
    <Stack spacing={4}>
      {projects.map((project) => {
        const stillNumbers = getProjectStillNumbers(project);
        const enabledCount = stillNumbers.filter(
          (still) => !isDisabled(project.slug, still),
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
                <img
                  className={classes.thumb}
                  src={`/img/brand/derived/${project.slug}-s${stillNumbers[0]}-640.webp`}
                  alt=""
                />
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
                color={enabledCount === stillNumbers.length ? "gray" : "orange"}
              >
                {t("admin.brand.project.enabledCount", {
                  enabled: enabledCount,
                  total: stillNumbers.length,
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
