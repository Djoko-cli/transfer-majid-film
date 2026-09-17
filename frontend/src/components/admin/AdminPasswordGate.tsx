import {
  Alert,
  Button,
  Paper,
  PasswordInput,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useForm, yupResolver } from "@mantine/form";
import { ReactNode } from "react";
import { TbShieldLock } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import * as yup from "yup";
import useTranslate from "../../hooks/useTranslate.hook";
import useUser from "../../hooks/user.hook";
import authService from "../../services/auth.service";
import toast from "../../utils/toast.util";

// An admin who signs in through the identity provider and nothing else has
// no way back in when that provider is unavailable — and the thing they are
// locked out of is the console they would need to fix it. The account page
// has always let a passwordless user set one; what was missing was any
// reason to do it before the day it matters, which is the one day it cannot
// be done.
//
// So the admin console asks for it at the door rather than reminding them
// inside. A dismissible notice would be no net at all: this is the second
// half of a credential pair, and half a pair is worth nothing.
//
// Deliberately NOT applied to LDAP accounts. Their credentials live in the
// directory and the account page shows them no password card at all (see
// `user?.isLdap ? null :` there), so demanding one here would be a real
// lockout with no way forward — the exact failure this exists to prevent.
//
// Admins only. An ordinary user with no fallback is inconvenienced; an
// admin with none is a service nobody can repair.
const AdminPasswordGate = ({ children }: { children: ReactNode }) => {
  const { user, refreshUser } = useUser();
  const t = useTranslate();

  const form = useForm({
    initialValues: { password: "", confirmation: "" },
    validate: yupResolver(
      yup.object().shape({
        password: yup
          .string()
          .min(8, t("common.error.too-short", { length: 8 }))
          .required(t("common.error.field-required")),
        // Not on the account page's own form, and earned here: this
        // password exists to be typed once, months later, on the day the
        // provider is down. A typo would be discovered exactly then.
        confirmation: yup
          .string()
          .oneOf([yup.ref("password")], t("admin.password-gate.error.mismatch"))
          .required(t("common.error.field-required")),
      }),
    ),
  });

  const needsPassword = !!user?.isAdmin && !user.hasPassword && !user.isLdap;
  if (!needsPassword) return <>{children}</>;

  return (
    <Paper p="xl" maw={560} mx="auto" mt="xl">
      <Title order={4} mb="xs">
        <FormattedMessage id="admin.password-gate.title" />
      </Title>
      <Text size="sm" color="dimmed" mb="lg">
        <FormattedMessage id="admin.password-gate.description" />
      </Text>

      <Alert
        variant="light"
        color="primary"
        icon={<TbShieldLock />}
        mb="lg"
        title={t("admin.password-gate.why.title")}
      >
        <FormattedMessage id="admin.password-gate.why.description" />
      </Alert>

      <form
        onSubmit={form.onSubmit((values) =>
          // Empty old password, exactly as the account page sends for a
          // passwordless user: AuthService.updatePassword skips that check
          // entirely when the row has no password to compare against.
          authService
            .updatePassword("", values.password)
            .then(async () => {
              await refreshUser();
              toast.success(t("account.notify.password.success"));
            })
            .catch(toast.axiosError),
        )}
      >
        <Stack>
          <PasswordInput
            label={t("admin.password-gate.password")}
            {...form.getInputProps("password")}
          />
          <PasswordInput
            label={t("admin.password-gate.confirmation")}
            {...form.getInputProps("confirmation")}
          />
          <Button type="submit" fullWidth>
            <FormattedMessage id="admin.password-gate.submit" />
          </Button>
        </Stack>
      </form>
    </Paper>
  );
};

export default AdminPasswordGate;
