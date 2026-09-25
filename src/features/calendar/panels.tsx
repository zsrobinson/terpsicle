import { MessageText } from "~/app/message-text";
import { PanelBody } from "~/app/panel";
import { type DrillViewProps, definePanels } from "~/app/registry";
import { DAY_LONG_NAMES, formatTime } from "~/core/time";
import { verdictMessage } from "~/core/travel";
import { usePlanConnections } from "~/state/hooks";

/**
 * Stands in for connection details until the Travel feature (M4) registers
 * the real view (map, math, sections that fix it). Delete this registration
 * then: two views for one drill kind log a warning.
 */
function ConnectionPlaceholder({ entry }: DrillViewProps<"connection">) {
  const connection = usePlanConnections().find(
    (c) => c.id === entry.connectionId,
  );
  return (
    <PanelBody className="px-4 py-3 text-[12.5px]">
      {connection ? (
        <>
          <p className="font-medium">
            {DAY_LONG_NAMES[connection.day]}: {connection.from.building} to{" "}
            {connection.to.building}
          </p>
          <p className="tnum mt-0.5 text-muted">
            Leave at {formatTime(connection.from.time)}, next class at{" "}
            {formatTime(connection.to.time)}
          </p>
          <p className="mt-3">
            <MessageText message={verdictMessage(connection)} />
          </p>
        </>
      ) : (
        <p className="text-muted">This connection isn't in the plan anymore.</p>
      )}
    </PanelBody>
  );
}

export const panels = definePanels({
  drills: {
    connection: {
      component: ConnectionPlaceholder,
      crumb: () => "Connection",
    },
  },
});
