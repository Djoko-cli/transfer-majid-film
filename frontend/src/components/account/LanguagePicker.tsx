import { Select } from "@mantine/core";
import useLanguage from "../../hooks/language.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import { LOCALES } from "../../i18n/locales";

const LanguagePicker = () => {
  const t = useTranslate();
  const { language, switchLanguage } = useLanguage();

  const languages = Object.values(LOCALES).map((locale) => ({
    value: locale.code,
    label: locale.name,
  }));
  return (
    <Select
      value={language}
      description={t("account.card.language.description")}
      onChange={(value) => value && switchLanguage(value)}
      data={languages}
    />
  );
};

export default LanguagePicker;
