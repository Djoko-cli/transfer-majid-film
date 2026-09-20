import { MultiSelect } from "@mantine/core";
import React, { useState } from "react";
import useTranslate from "../../hooks/useTranslate.hook";

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

/**
 * A list of email addresses typed one at a time.
 *
 * Shared by the direct transfer's recipients and the deposit link's
 * invitations, which must behave identically: the keystroke handling below
 * is not obvious, it was arrived at from a real report, and two copies of
 * it would drift.
 *
 * Takes a list and a way to change it rather than a Mantine form:
 * `UseFormReturnType` is invariant in its value type, so a shared component
 * typed against it cannot accept two forms of different shapes without
 * reaching for `any`. Four props at each call site is the honest price, and
 * the component gains nothing from knowing a form exists.
 */
const EmailRecipientsInput = ({
  values,
  onChange,
  error,
  onError,
  label,
  placeholder,
  description,
  withAsterisk,
  tabIndex,
  id,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  /** The field's current error, straight from the form that owns it. */
  error?: React.ReactNode;
  /** Raises or clears that error — `null` clears. */
  onError: (message: string | null) => void;
  label: string;
  placeholder: string;
  description?: string;
  withAsterisk?: boolean;
  tabIndex?: number;
  id?: string;
}) => {
  const t = useTranslate();
  const [search, setSearch] = useState("");

  const reject = () => onError(t("upload.modal.accordion.email.invalid-email"));

  const add = (address: string) => {
    onError(null);
    if (!values.includes(address)) onChange([...values, address]);
  };

  return (
    <MultiSelect
      withAsterisk={withAsterisk}
      label={label}
      description={description}
      data={values}
      value={values}
      error={error}
      placeholder={placeholder}
      searchable
      creatable
      variant="filled"
      id={id}
      inputMode="email"
      tabIndex={tabIndex}
      searchValue={search}
      onSearchChange={setSearch}
      getCreateLabel={(query) => `+ ${query}`}
      onCreate={(query) => {
        if (!EMAIL_PATTERN.test(query)) {
          reject();
          return undefined;
        }
        add(query);
        return query;
      }}
      onChange={(next: string[]) => onChange(next)}
      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
        // Enter, comma, semicolon and space all mean "that is one address,
        // take it" — a space because an address cannot contain one, so the
        // keystroke has no other possible meaning here.
        if (e.key !== "Enter" && e.key !== "," && e.key !== ";" && e.key !== " ")
          return;
        e.preventDefault();

        const typed = search.trim();
        if (!typed) return;

        // The field used to be emptied on every one of these keys, whether
        // or not the address was accepted. A half-typed one —
        // "majid.riviere@gmail", no TLD yet — failed the pattern, was not
        // added, and was wiped anyway: the typing vanished with nothing
        // said. What came next then landed in an empty field, which is why
        // this surfaced as "the address erases itself and keeps only the
        // .com". On an AZERTY Mac the period is Shift+semicolon, so a Shift
        // that does not register sends ";" and triggers exactly this, which
        // is what makes it intermittent rather than constant.
        //
        // Refusing an address now leaves it in the field to be corrected,
        // and says why.
        if (!EMAIL_PATTERN.test(typed)) {
          reject();
          return;
        }

        add(typed);
        setSearch("");
      }}
    />
  );
};

export default EmailRecipientsInput;
