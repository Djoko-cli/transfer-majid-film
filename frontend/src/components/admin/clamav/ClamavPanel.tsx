import {
  Badge,
  Box,
  Button,
  Card,
  Group,
  Loader,
  Pagination,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import moment from "moment";
import { useEffect, useState } from "react";
import { TbRefresh } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import configService, { ClamavScan } from "../../../services/config.service";
import useTranslate from "../../../hooks/useTranslate.hook";

const PAGE_SIZE = 20;

const statusColor: Record<ClamavScan["status"], string> = {
  clean: "green",
  infected: "red",
  error: "yellow",
};

const actionColor: Record<NonNullable<ClamavScan["action"]>, string> = {
  delete: "red",
  quarantine: "yellow",
  // Neutral rather than a warning color — choosing "none" is deliberate
  // inaction, not itself something to flag the way delete/quarantine's
  // own colors do.
  none: "gray",
};

// freshclam (the updater running inside the ClamAV container, separate
// from clamd — see clamscan.service.ts) checks for new signatures
// several times a day by default, so a database genuinely this old
// almost always means freshclam itself is stuck — a NAS firewall or
// restricted outbound internet blocking its update mirrors, most
// commonly — not just "hasn't gotten around to it yet". `connected` can
// still read true here: clamd itself is fine and scanning normally,
// just against signatures this stale.
const STALE_DATABASE_DAYS = 2;

// Read-only status + scan history for the "Clamav" admin config category.
// The enable/disable toggle itself is just another `clamav.enabled` config
// field, rendered above this by the normal config-category loop — this
// panel only adds what a plain config field can't: live connectivity to
// clamd, and the persisted history of what's actually been scanned.
const ClamavPanel = () => {
  const t = useTranslate();
  const isMobile = useMediaQuery("(max-width: 48em)");

  const [status, setStatus] = useState<{
    enabled: boolean;
    connected: boolean;
    version: string | null;
    engineVersion: string | null;
    database: { revision: number; builtAt: string } | null;
  } | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const [scans, setScans] = useState<ClamavScan[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [scansLoading, setScansLoading] = useState(true);

  const loadStatus = () => {
    setStatusLoading(true);
    configService
      .getClamavStatus()
      .then(setStatus)
      .finally(() => setStatusLoading(false));
  };

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    setScansLoading(true);
    configService
      .getClamavScans(PAGE_SIZE, (page - 1) * PAGE_SIZE)
      .then((result) => {
        setScans(result.scans);
        setTotal(result.total);
      })
      .finally(() => setScansLoading(false));
  }, [page]);

  return (
    <Stack mt="xl">
      <Card withBorder radius="md" p="md">
        <Group position="apart" align="flex-start">
          <Stack spacing={4}>
            <Title order={5}>
              <FormattedMessage id="admin.clamav.status.title" />
            </Title>
            {statusLoading ? (
              <Loader size="xs" />
            ) : (
              <Group spacing="xs">
                <Badge
                  color={status?.connected ? "green" : "red"}
                  variant="light"
                >
                  <FormattedMessage
                    id={
                      status?.connected
                        ? "admin.clamav.status.connected"
                        : "admin.clamav.status.disconnected"
                    }
                  />
                </Badge>
                {
                  // database parses cleanly in the overwhelming common
                  // case (see clamscan.service.ts's parseClamdVersion) —
                  // version (the raw clamd reply) is the fallback for
                  // whatever's left: an unexpected format, a very old or
                  // very new ClamAV build using a different one, etc.
                  // Never both at once.
                }
                {status?.database ? (
                  <Text size="sm" color="dimmed">
                    <FormattedMessage
                      id="admin.clamav.status.database"
                      values={{
                        revision: status.database.revision,
                        date: moment(status.database.builtAt).format("L LT"),
                      }}
                    />
                  </Text>
                ) : (
                  status?.version && (
                    <Text size="sm" color="dimmed">
                      {status.version}
                    </Text>
                  )
                )}
              </Group>
            )}
            {!statusLoading &&
              status?.database &&
              moment().diff(moment(status.database.builtAt), "days") >=
                STALE_DATABASE_DAYS && (
                <Text size="xs" color="yellow">
                  <FormattedMessage
                    id="admin.clamav.status.database.stale"
                    values={{
                      days: moment().diff(
                        moment(status.database.builtAt),
                        "days",
                      ),
                    }}
                  />
                </Text>
              )}
          </Stack>
          <Button
            variant="subtle"
            size="xs"
            leftIcon={<TbRefresh />}
            onClick={loadStatus}
          >
            <FormattedMessage id="common.button.refresh" />
          </Button>
        </Group>
      </Card>

      <Box>
        <Title order={5} mb="sm">
          <FormattedMessage id="admin.clamav.scans.title" />
        </Title>
        {scansLoading ? (
          <Loader size="sm" />
        ) : scans.length === 0 ? (
          <Text color="dimmed" size="sm">
            <FormattedMessage id="admin.clamav.scans.empty" />
          </Text>
        ) : (
          <>
            <Table sx={{ tableLayout: "fixed", width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ width: isMobile ? 80 : 150 }}>
                    <FormattedMessage id="admin.clamav.scans.column.date" />
                  </th>
                  <th>
                    <FormattedMessage id="admin.clamav.scans.column.share" />
                  </th>
                  <th style={{ width: isMobile ? 55 : 70 }}>
                    <FormattedMessage id="admin.clamav.scans.column.files" />
                  </th>
                  <th style={{ width: isMobile ? 85 : 100 }}>
                    <FormattedMessage id="admin.clamav.scans.column.status" />
                  </th>
                  <th style={{ width: isMobile ? 40 : 110 }}>
                    <FormattedMessage id="admin.clamav.scans.column.action" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {scans.map((scan) => (
                  <tr key={scan.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {moment(scan.createdAt).format(isMobile ? "L" : "L LT")}
                    </td>
                    <td>
                      <Tooltip
                        disabled={!scan.shareName && !scan.shareId}
                        label={scan.shareName || scan.shareId}
                      >
                        <Text truncate size="sm">
                          {scan.shareName || scan.shareId || "—"}
                        </Text>
                      </Tooltip>
                    </td>
                    <td>
                      {scan.status === "infected"
                        ? `${scan.infectedCount}/${scan.fileCount}`
                        : scan.fileCount}
                    </td>
                    <td>
                      <Tooltip
                        disabled={!scan.infectedFileNames && !scan.errorMessage}
                        label={scan.infectedFileNames || scan.errorMessage}
                        multiline
                        width={260}
                      >
                        <Badge color={statusColor[scan.status]} variant="light">
                          <FormattedMessage
                            id={`admin.clamav.scans.status.${scan.status}`}
                          />
                        </Badge>
                      </Tooltip>
                    </td>
                    <td>
                      {
                        // A dot + tooltip rather than a second full text
                        // Badge — this column is blank for the common
                        // case (every clean/error scan), and a full
                        // "Mis en quarantaine" pill has no room to exist
                        // at this column's mobile width (40px) the way
                        // the status column's shorter labels do.
                      }
                      {scan.action ? (
                        <Tooltip
                          label={t(`admin.clamav.scans.action.${scan.action}`)}
                        >
                          <Box
                            sx={(theme) => ({
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              backgroundColor:
                                theme.colors[actionColor[scan.action!]][6],
                            })}
                          />
                        </Tooltip>
                      ) : (
                        <Text color="dimmed">—</Text>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {total > PAGE_SIZE && (
              <Group position="right" mt="sm">
                <Pagination
                  total={Math.ceil(total / PAGE_SIZE)}
                  value={page}
                  onChange={setPage}
                />
              </Group>
            )}
          </>
        )}
      </Box>
    </Stack>
  );
};

export default ClamavPanel;
