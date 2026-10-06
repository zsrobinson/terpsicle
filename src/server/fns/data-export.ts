// Your data's route (docs/DATA.md §5.6), signed in only. Apart from
// ~/server/fns/api so Settings' first load never carries the data file's
// schemas: they load when someone downloads or adds a file.
import {
  AccountDataSchema,
  AccountExportInputSchema,
} from "~/core/schema/data-export";
import { type ApiOptions, call } from "./api";

export const dataExportApi = {
  /** What only the account holds, for the data file. */
  account: (options?: ApiOptions) =>
    call(
      "account/export",
      AccountExportInputSchema,
      AccountDataSchema,
      {},
      options,
    ),
};
