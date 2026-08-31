import {
  Button,
  Center,
  Col,
  Container,
  Grid,
  Group,
  Skeleton,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import Meta from "../../components/Meta";
import AdminLayout from "../../components/admin/AdminLayout";
import BrandProjectList from "../../components/admin/brand/BrandProjectList";
import BrandStillGrid from "../../components/admin/brand/BrandStillGrid";
import useConfig from "../../hooks/config.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import brandSlideService from "../../services/brandSlide.service";
import configService from "../../services/config.service";
import { NextPageWithLayout } from "../../types/page.type";
import { BrandCatalogProject } from "../../types/brandSlide.type";
import toast from "../../utils/toast.util";

const keyOf = (slug: string, still: number) => `${slug}-s${still}`;

const Brand: NextPageWithLayout = () => {
  const t = useTranslate();
  const config = useConfig();

  const [catalog, setCatalog] = useState<BrandCatalogProject[]>([]);
  const [disabledKeys, setDisabledKeys] = useState<Set<string>>(new Set());
  // Gates the initial render only — every disabled/enabled count and
  // switch would otherwise flash "all shown" for a moment before this
  // resolves and corrects itself. Distinct from pendingKeys below, which
  // tracks per-toggle in-flight state after this first load.
  const [isLoading, setIsLoading] = useState(true);
  // Only stills whose own PATCH is still in flight — never a page-wide
  // loading lock, so one slow request never freezes every other switch a
  // moment after this page has already loaded.
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const loadCatalog = () =>
    Promise.all([
      brandSlideService.getCatalog(),
      brandSlideService.getDisabled(),
    ]).then(([liveCatalog, disabled]) => {
      setCatalog(liveCatalog);
      setDisabledKeys(new Set(disabled.map((d) => keyOf(d.slug, d.still))));
      // Keep the current selection if it's still in the (possibly just
      // grown) catalog; otherwise default to the first project — covers
      // both the very first load and "selection was on a project that
      // somehow isn't there yet".
      setSelectedSlug((prev) =>
        prev && liveCatalog.some((p) => p.slug === prev)
          ? prev
          : (liveCatalog[0]?.slug ?? null),
      );
    });

  useEffect(() => {
    loadCatalog().finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDisabled = (slug: string, still: number) =>
    disabledKeys.has(keyOf(slug, still));

  // Instant, optimistic, per-image save — flips local state right away,
  // fires the PATCH in the background, rolls back and toasts on failure.
  // No staged batch/Save button: with potentially hundreds of fully
  // independent toggles clicked in one browsing session, staging risks
  // silently losing a large pending set on an accidental navigation, and
  // nothing here needs a multi-field commit the way the generic config
  // category pages' interdependent settings do.
  const setStillDisabled = (slug: string, still: number, disabled: boolean) => {
    const key = keyOf(slug, still);

    setDisabledKeys((prev) => {
      const next = new Set(prev);
      if (disabled) next.add(key);
      else next.delete(key);
      return next;
    });
    setPendingKeys((prev) => new Set(prev).add(key));

    brandSlideService
      .setDisabled(slug, still, disabled)
      .catch((e) => {
        setDisabledKeys((prev) => {
          const next = new Set(prev);
          if (disabled) next.delete(key);
          else next.add(key);
          return next;
        });
        toast.axiosError(e);
      })
      .finally(() => {
        setPendingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      });
  };

  // "Enable all / disable all" is pure UI convenience, not a new
  // persisted fact or a bulk endpoint — it just fires the same per-image
  // toggle once for every still in this project that isn't already in the
  // target state, each an independent request.
  const toggleAllInProject = (
    project: BrandCatalogProject,
    disabled: boolean,
  ) => {
    for (const { still } of project.stills) {
      if (isDisabled(project.slug, still) !== disabled) {
        setStillDisabled(project.slug, still, disabled);
      }
    }
  };

  const runSync = () => {
    setIsSyncing(true);
    brandSlideService
      .syncNow()
      .then((result) => {
        // A non-ok backend result (not configured, or already running
        // from a concurrent trigger) never reaches here as a success —
        // brandSlides.controller.ts's sync route throws instead, caught
        // below via toast.axiosError, which surfaces the backend's own
        // i18n'd message.
        if (result.newProjects || result.newStills) {
          toast.success(
            t("admin.brand.sync.notify.success", {
              newProjects: result.newProjects,
              newStills: result.newStills,
            }),
          );
        } else {
          toast.success(t("admin.brand.sync.notify.upToDate"));
        }
        return loadCatalog();
      })
      .catch(toast.axiosError)
      .finally(() => setIsSyncing(false));
  };

  const toggleEnableSync = (enabled: boolean) => {
    configService
      .updateMany([{ key: "brand.enableSync", value: enabled }])
      .then(() => config.refresh())
      .catch(toast.axiosError);
  };

  const selectedProject = catalog.find((p) => p.slug === selectedSlug);

  return (
    <>
      <Meta title={t("admin.brand.title")} />
      <Container size="lg">
        <Group position="apart" align="center" mb={20}>
          <Title order={3} mb={0}>
            <FormattedMessage id="admin.brand.title" />
          </Title>
          {!isLoading && catalog.length > 0 && (
            <Group spacing="md">
              <Switch
                label={t("admin.brand.sync.enable")}
                checked={!!config.get("brand.enableSync")}
                onChange={(e) => toggleEnableSync(e.currentTarget.checked)}
              />
              <Button variant="light" loading={isSyncing} onClick={runSync}>
                <FormattedMessage id="admin.brand.sync.button" />
              </Button>
            </Group>
          )}
        </Group>

        {isLoading ? (
          <Stack spacing="xs">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} height={48} />
            ))}
          </Stack>
        ) : catalog.length === 0 ? (
          // Honest empty state, no silent fallback to any bundled data —
          // unlike BrandPanel.tsx's own public-facing fallback, an admin
          // looking at THIS page is specifically the one person who can
          // act on "nothing synced yet", so showing a stale/different
          // picture here would only be confusing.
          <Center style={{ height: "50vh" }}>
            <Stack align="center" spacing="md">
              <Title order={2}>
                <FormattedMessage id="admin.brand.notSynced.title" />
              </Title>
              <Text color="dimmed" align="center" maw={420}>
                <FormattedMessage id="admin.brand.notSynced.description" />
              </Text>
              <Switch
                label={t("admin.brand.sync.enable")}
                description={t("admin.brand.sync.enable.description")}
                checked={!!config.get("brand.enableSync")}
                onChange={(e) => toggleEnableSync(e.currentTarget.checked)}
              />
              <Button loading={isSyncing} onClick={runSync}>
                <FormattedMessage id="admin.brand.sync.button" />
              </Button>
            </Stack>
          </Center>
        ) : (
          <Grid gutter="xl">
            <Col xs={12} sm={4}>
              <BrandProjectList
                projects={catalog}
                selectedSlug={selectedSlug}
                onSelect={setSelectedSlug}
                isDisabled={isDisabled}
              />
            </Col>
            <Col xs={12} sm={8}>
              {selectedProject && (
                <BrandStillGrid
                  project={selectedProject}
                  isDisabled={isDisabled}
                  pendingKeys={pendingKeys}
                  onToggle={setStillDisabled}
                  onToggleAll={toggleAllInProject}
                />
              )}
            </Col>
          </Grid>
        )}
      </Container>
    </>
  );
};

Brand.getLayout = (page) => <AdminLayout>{page}</AdminLayout>;

export default Brand;
