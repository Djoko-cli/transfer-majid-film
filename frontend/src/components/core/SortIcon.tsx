import { ActionIcon } from "@mantine/core";
import { Dispatch, SetStateAction } from "react";
import { TbChevronDown, TbChevronUp, TbSelector } from "react-icons/tb";
import useTranslate from "../../hooks/useTranslate.hook";

export type TableSort = {
  property?: string;
  direction: "asc" | "desc";
};

const TableSortIcon = ({
  sort,
  setSort,
  property,
  label,
}: {
  sort: TableSort;
  setSort: Dispatch<SetStateAction<TableSort>>;
  property: string;
  // The column's own display text (e.g. "Nom") — this component is
  // property-agnostic, so it has no name for the column to build an
  // accessible label from otherwise.
  label: string;
}) => {
  const t = useTranslate();
  // Mantine's default ActionIcon size (md, 28px) is sized for a standalone,
  // easily-tappable button — appropriate for the row-level file actions
  // elsewhere in this app, but this is a small inline indicator riding
  // right next to a column header's own text, not a primary control; at
  // the default size it was the single biggest thing eating into a narrow
  // column's width budget (e.g. "Taille"'s), for a glyph that only needs
  // to be legible, not thumb-sized.
  if (sort.property === property) {
    const nextDirection = sort.direction === "asc" ? "desc" : "asc";
    return (
      <ActionIcon
        size={18}
        onClick={() => setSort({ property, direction: nextDirection })}
        aria-label={t(
          nextDirection === "asc"
            ? "share.table.sort-ascending"
            : "share.table.sort-descending",
          { label },
        )}
      >
        {sort.direction === "asc" ? <TbChevronDown /> : <TbChevronUp />}
      </ActionIcon>
    );
  } else {
    return (
      <ActionIcon
        size={18}
        onClick={() => setSort({ property, direction: "asc" })}
        aria-label={t("share.table.sort-ascending", { label })}
      >
        <TbSelector />
      </ActionIcon>
    );
  }
};

export default TableSortIcon;
