import { Col, Container, Grid, Skeleton, Stack, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { FormattedMessage } from "react-intl";
import Meta from "../../components/Meta";
import AdminLayout from "../../components/admin/AdminLayout";
import BrandProjectList from "../../components/admin/brand/BrandProjectList";
import BrandStillGrid from "../../components/admin/brand/BrandStillGrid";
import {
  BrandProject,
  PROJECTS,
  getProjectStillNumbers,
} from "../../data/brandProjects";
import useTranslate from "../../hooks/useTranslate.hook";
import brandSlideService from "../../services/brandSlide.service";
import { NextPageWithLayout } from "../../types/page.type";
import toast from "../../utils/toast.util";

const keyOf = (slug: string, still: number) => `${slug}-s${still}`;

const Brand: NextPageWithLayout = () => {
  const t = useTranslate();

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
  const [selectedSlug, setSelectedSlug] = useState<string | null>(
    PROJECTS[0]?.slug ?? null,
  );

  useEffect(() => {
    brandSlideService.getDisabled().then((disabled) => {
      setDisabledKeys(new Set(disabled.map((d) => keyOf(d.slug, d.still))));
      setIsLoading(false);
    });
  }, []);

  const isDisabled = (slug: string, still: number) =>
    disabledKeys.has(keyOf(slug, still));

  // Instant, optimistic, per-image save — flips local state right away,
  // fires the PATCH in the background, rolls back and toasts on failure.
  // No staged batch/Save button: with up to ~106 fully independent
  // toggles clicked in one browsing session, staging risks silently
  // losing a large pending set on an accidental navigation, and nothing
  // here needs a multi-field commit the way the generic config category
  // pages' interdependent settings do.
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
  const toggleAllInProject = (project: BrandProject, disabled: boolean) => {
    for (const still of getProjectStillNumbers(project)) {
      if (isDisabled(project.slug, still) !== disabled) {
        setStillDisabled(project.slug, still, disabled);
      }
    }
  };

  const selectedProject = PROJECTS.find((p) => p.slug === selectedSlug);

  return (
    <>
      <Meta title={t("admin.brand.title")} />
      <Container size="lg">
        <Title order={3} mb={20}>
          <FormattedMessage id="admin.brand.title" />
        </Title>
        {isLoading ? (
          <Stack spacing="xs">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} height={48} />
            ))}
          </Stack>
        ) : (
          <Grid gutter="xl">
            <Col xs={12} sm={4}>
              <BrandProjectList
                projects={PROJECTS}
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
