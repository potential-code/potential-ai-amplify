import type { Feature } from "write-excel-file/node";
import {
  getCellAddress,
  getOrderOfSiblings,
  getSelfClosingTagMarkup,
  insertElementMarkupAccordingToOrderOfSiblings,
} from "write-excel-file/utility";

/**
 * Shared bits for the Excel files AI Amplify writes with write-excel-file
 * (admin exports, AI Insights reports).
 */

/** AI Amplify's brand colour, for header rows. */
export const BRAND_HEX = "#652D90";

/**
 * Filter dropdowns on the first row, across `columnCount` columns.
 * write-excel-file has no built-in auto filter, so this inserts the
 * <autoFilter> element in the sheet XML where the format requires it.
 */
export function autoFilter(columnCount: number): Feature<Buffer> {
  const ref = `${getCellAddress(0, 0)}:${getCellAddress(0, columnCount - 1)}`;
  return {
    files: {
      transform: {
        "xl/worksheets/sheet{id}.xml": {
          transform: (xml) =>
            insertElementMarkupAccordingToOrderOfSiblings(
              xml,
              getSelfClosingTagMarkup("autoFilter", { ref }),
              getOrderOfSiblings("xl/worksheets/sheet{id}.xml", "worksheet") ?? [],
              "worksheet",
            ),
        },
      },
    },
  };
}
