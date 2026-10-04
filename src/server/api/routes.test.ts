// The composed route table: splitting it by area must not move, drop or
// loosen a route.
import { describe, expect, it } from "vitest";
import { ROUTE_TABLES, ROUTES } from "./router";

/** One line per route: its name, who may call it, and its limits. */
const summary = () =>
  Object.entries(ROUTES)
    .map(([name, r]) => {
      const route: {
        auth?: string;
        perIpPerHour?: number;
        perUserPerHour?: number;
        maxBytes?: number;
        reviews?: string;
        whenOff?: unknown;
      } = r;
      return [
        name,
        `auth=${route.auth ?? "none"}`,
        `ip=${route.perIpPerHour ?? "-"}`,
        `user=${route.perUserPerHour ?? "-"}`,
        `bytes=${route.maxBytes ?? "-"}`,
        `reviews=${route.reviews ?? "-"}`,
        `whenOff=${route.whenOff === undefined ? "-" : JSON.stringify(route.whenOff)}`,
      ].join(" ");
    })
    .sort();

describe("the composed route table", () => {
  it("keeps every route's name, auth level and limits", () => {
    expect(summary()).toMatchInlineSnapshot(`
      [
        "account/delete auth=user ip=30 user=10 bytes=- reviews=- whenOff=-",
        "admin/chat/remove auth=admin ip=600 user=- bytes=- reviews=- whenOff=-",
        "admin/decisions auth=admin ip=600 user=- bytes=- reviews=- whenOff=-",
        "admin/feedback/delete auth=admin ip=600 user=- bytes=- reviews=- whenOff=-",
        "admin/feedback/group auth=admin ip=60 user=- bytes=- reviews=- whenOff=-",
        "admin/feedback/list auth=admin ip=600 user=- bytes=- reviews=- whenOff=-",
        "admin/feedback/update auth=admin ip=600 user=- bytes=- reviews=- whenOff=-",
        "admin/grades auth=admin ip=600 user=- bytes=- reviews=- whenOff=-",
        "admin/grades/save auth=admin ip=600 user=- bytes=- reviews=- whenOff=-",
        "admin/health auth=admin ip=600 user=- bytes=- reviews=- whenOff=-",
        "admin/moderation/queue auth=admin ip=600 user=- bytes=- reviews=- whenOff=-",
        "admin/moderation/resolve auth=admin ip=600 user=- bytes=- reviews=- whenOff=-",
        "admin/moderation/undo auth=admin ip=600 user=- bytes=- reviews=- whenOff=-",
        "admin/samples auth=admin ip=60 user=- bytes=- reviews=- whenOff=-",
        "alerts/list auth=user ip=- user=600 bytes=- reviews=- whenOff={"status":"unavailable"}",
        "alerts/unwatch auth=user ip=- user=120 bytes=- reviews=- whenOff=-",
        "alerts/watch auth=user ip=- user=120 bytes=- reviews=- whenOff={"status":"unavailable"}",
        "auth/sign-out auth=none ip=30 user=- bytes=- reviews=- whenOff=-",
        "auth/test-sign-in auth=none ip=60 user=- bytes=- reviews=- whenOff=-",
        "calendar/feed auth=user ip=- user=120 bytes=- reviews=- whenOff=-",
        "calendar/feed/reset auth=user ip=- user=20 bytes=- reviews=- whenOff=-",
        "chat/follow auth=user ip=- user=600 bytes=- reviews=- whenOff=-",
        "chat/joins auth=user ip=- user=600 bytes=- reviews=- whenOff=-",
        "chat/latest auth=user ip=- user=1200 bytes=- reviews=- whenOff=-",
        "chat/members auth=user ip=- user=600 bytes=- reviews=- whenOff=-",
        "chat/mute auth=user ip=- user=600 bytes=- reviews=- whenOff=-",
        "chat/unfollow auth=user ip=- user=600 bytes=- reviews=- whenOff=-",
        "chat/unread auth=user ip=- user=1200 bytes=- reviews=- whenOff=-",
        "feedback/pin auth=admin ip=600 user=- bytes=3000000 reviews=- whenOff=-",
        "feedback/pins auth=admin ip=2000 user=- bytes=- reviews=- whenOff=-",
        "feedback/send auth=optional ip=12 user=20 bytes=3000000 reviews=- whenOff=-",
        "feedback/undo auth=optional ip=30 user=- bytes=- reviews=- whenOff=-",
        "me auth=none ip=600 user=- bytes=- reviews=- whenOff=-",
        "notifications/inbox auth=user ip=- user=600 bytes=- reviews=- whenOff=-",
        "notifications/read auth=user ip=- user=1200 bytes=- reviews=- whenOff=-",
        "notifications/settings auth=user ip=- user=300 bytes=- reviews=- whenOff=-",
        "notifications/settings/set auth=user ip=- user=120 bytes=- reviews=- whenOff=-",
        "notifications/unread auth=user ip=- user=600 bytes=- reviews=- whenOff=-",
        "planetterp/reviews auth=none ip=1200 user=- bytes=- reviews=- whenOff=-",
        "planetterp/totals auth=none ip=600 user=- bytes=- reviews=- whenOff=-",
        "push/devices auth=user ip=- user=300 bytes=- reviews=- whenOff=-",
        "push/remove auth=user ip=- user=60 bytes=- reviews=- whenOff=-",
        "push/subscribe auth=user ip=- user=60 bytes=- reviews=- whenOff=-",
        "push/test auth=user ip=- user=10 bytes=- reviews=- whenOff=-",
        "push/unsubscribe auth=user ip=- user=60 bytes=- reviews=- whenOff=-",
        "reports/create auth=user ip=- user=30 bytes=- reviews=- whenOff=-",
        "reviews/delete auth=user ip=- user=60 bytes=- reviews=read whenOff=-",
        "reviews/edit auth=user ip=- user=30 bytes=- reviews=on whenOff=-",
        "reviews/latest auth=none ip=600 user=- bytes=- reviews=- whenOff=-",
        "reviews/list auth=none ip=1200 user=- bytes=- reviews=read whenOff=-",
        "reviews/mine auth=user ip=- user=300 bytes=- reviews=read whenOff=-",
        "reviews/page auth=none ip=1200 user=- bytes=- reviews=- whenOff=-",
        "reviews/submit auth=user ip=- user=20 bytes=- reviews=on whenOff=-",
        "sync/pull auth=user ip=- user=600 bytes=- reviews=- whenOff=-",
        "sync/push auth=user ip=- user=1200 bytes=3342336 reviews=- whenOff=-",
        "todo/connect auth=user ip=30 user=10 bytes=- reviews=- whenOff=-",
        "todo/delete-task auth=user ip=- user=600 bytes=- reviews=- whenOff=-",
        "todo/disconnect auth=user ip=- user=30 bytes=- reviews=- whenOff=-",
        "todo/done auth=user ip=- user=1200 bytes=- reviews=- whenOff=-",
        "todo/hide-course auth=user ip=- user=300 bytes=- reviews=- whenOff=-",
        "todo/import-file auth=user ip=- user=20 bytes=1048576 reviews=- whenOff=-",
        "todo/list auth=user ip=- user=600 bytes=- reviews=- whenOff=-",
        "todo/refresh auth=user ip=- user=30 bytes=- reviews=- whenOff=-",
        "todo/save-task auth=user ip=- user=600 bytes=- reviews=- whenOff=-",
      ]
    `);
  });

  it("gives each name to one area", () => {
    const owners = new Map<string, string[]>();
    for (const [area, table] of Object.entries(ROUTE_TABLES))
      for (const name of Object.keys(table))
        owners.set(name, [...(owners.get(name) ?? []), area]);
    const shared = [...owners].filter(([, areas]) => areas.length > 1);
    expect(shared).toEqual([]);
  });

  it("composes every area's table and nothing else", () => {
    expect(Object.keys(ROUTES).sort()).toEqual(
      Object.values(ROUTE_TABLES)
        .flatMap((table) => Object.keys(table))
        .sort(),
    );
  });
});
