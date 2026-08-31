import { Title } from "@mantine/core";
import Meta from "../../components/Meta";
import useTranslate from "../../hooks/useTranslate.hook";
import { FormattedMessage } from "react-intl";
import useConfig from "../../hooks/config.hook";
import LegalMarkdown from "../../components/legal/LegalMarkdown";

const Imprint = () => {
  const t = useTranslate();
  const config = useConfig();
  return (
    <>
      <Meta title={t("imprint.title")} />
      <Title mt="xl" mb={30} order={1}>
        <FormattedMessage id="imprint.title" />
      </Title>
      <LegalMarkdown content={config.get("legal.imprintText")} />
    </>
  );
};

export default Imprint;
