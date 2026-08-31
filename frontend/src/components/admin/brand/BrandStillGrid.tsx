import {
  Button,
  Card,
  Group,
  SimpleGrid,
  Switch,
  Text,
  Title,
  createStyles,
} from "@mantine/core";
import { FormattedMessage } from "react-intl";
import useTranslate from "../../../hooks/useTranslate.hook";
import brandSlideService from "../../../services/brandSlide.service";
import { BrandCatalogProject } from "../../../types/brandSlide.type";

const useStyles = createStyles((theme) => ({
  thumb: {
    display: "block",
    width: "100%",
    aspectRatio: "4 / 3",
    objectFit: "cover",
  },

  // The switch sits in its own solid-background footer below the image,
  // deliberately never floated on top of it — BrandPanel's own caption
  // needed a heavy text-shadow specifically because control legibility
  // against an arbitrary, unpredictable photo is unreliable; a solid strip
  // sidesteps that instead of fighting it again here.
  footer: {
    borderTop: `1px solid ${theme.colors.dark[4]}`,
  },
}));

// Right pane of the brand-slide curation page — the selected project's
// stills as a small thumbnail grid, each with its own instant-save toggle.
const BrandStillGrid = ({
  project,
  isDisabled,
  pendingKeys,
  onToggle,
  onToggleAll,
}: {
  project: BrandCatalogProject;
  isDisabled: (slug: string, still: number) => boolean;
  pendingKeys: Set<string>;
  onToggle: (slug: string, still: number, disabled: boolean) => void;
  onToggleAll: (project: BrandCatalogProject, disabled: boolean) => void;
}) => {
  const { classes } = useStyles();
  const t = useTranslate();

  return (
    <div>
      <Group position="apart" mb="md">
        <div>
          <Title order={4}>{project.title}</Title>
          <Text size="xs" color="dimmed">
            {project.year}
          </Text>
        </div>
        <Group spacing="xs">
          <Button
            variant="light"
            size="xs"
            onClick={() => onToggleAll(project, false)}
          >
            <FormattedMessage id="admin.brand.project.enableAll" />
          </Button>
          <Button
            variant="light"
            color="red"
            size="xs"
            onClick={() => onToggleAll(project, true)}
          >
            <FormattedMessage id="admin.brand.project.disableAll" />
          </Button>
        </Group>
      </Group>
      <SimpleGrid
        cols={3}
        spacing="md"
        breakpoints={[{ maxWidth: "sm", cols: 2 }]}
      >
        {project.stills.map(({ still }) => {
          const key = `${project.slug}-s${still}`;
          const disabled = isDisabled(project.slug, still);
          const pending = pendingKeys.has(key);

          return (
            <Card key={key} withBorder p={0} radius="sm">
              <img
                className={classes.thumb}
                src={brandSlideService.getImageUrl(
                  project.slug,
                  still,
                  640,
                  "webp",
                )}
                alt=""
                style={{ opacity: disabled ? 0.5 : 1 }}
              />
              <Group className={classes.footer} position="apart" p="xs" noWrap>
                <Text size="xs">{t("admin.brand.still.enabled")}</Text>
                <Switch
                  checked={!disabled}
                  disabled={pending}
                  onChange={(e) =>
                    onToggle(project.slug, still, !e.currentTarget.checked)
                  }
                />
              </Group>
            </Card>
          );
        })}
      </SimpleGrid>
    </div>
  );
};

export default BrandStillGrid;
