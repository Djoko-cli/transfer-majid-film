import { ActionIcon } from "@mantine/core";
import { Dispatch, SetStateAction } from "react";
import { TbChevronDown, TbChevronUp, TbSelector } from "react-icons/tb";

export type TableSort = {
  property?: string;
  direction: "asc" | "desc";
};

const TableSortIcon = ({
  sort,
  setSort,
  property,
}: {
  sort: TableSort;
  setSort: Dispatch<SetStateAction<TableSort>>;
  property: string;
}) => {
  // Mantine's default ActionIcon size (md, 28px) is sized for a standalone,
  // easily-tappable button — appropriate for the row-level file actions
  // elsewhere in this app, but this is a small inline indicator riding
  // right next to a column header's own text, not a primary control; at
  // the default size it was the single biggest thing eating into a narrow
  // column's width budget (e.g. "Taille"'s), for a glyph that only needs
  // to be legible, not thumb-sized.
  if (sort.property === property) {
    return (
      <ActionIcon
        size={18}
        onClick={() =>
          setSort({
            property,
            direction: sort.direction === "asc" ? "desc" : "asc",
          })
        }
      >
        {sort.direction === "asc" ? <TbChevronDown /> : <TbChevronUp />}
      </ActionIcon>
    );
  } else {
    return (
      <ActionIcon
        size={18}
        onClick={() => setSort({ property, direction: "asc" })}
      >
        <TbSelector />
      </ActionIcon>
    );
  }
};

export default TableSortIcon;
