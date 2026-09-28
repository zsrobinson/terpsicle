// Terpsicle Todo's JSON routes (docs/V3.md §3.8), composed into
// src/server/api/router.ts. Each answers "unavailable" while TODO_ENABLED is
// off or the feed key is missing (outside test mode).
import {
  TODO_IMPORT_MAX_BYTES,
  TodoConnectInputSchema,
  TodoDeleteTaskInputSchema,
  TodoDisconnectInputSchema,
  TodoDoneInputSchema,
  TodoHideCourseInputSchema,
  TodoImportFileInputSchema,
  TodoListInputSchema,
  TodoRefreshInputSchema,
  TodoSaveTaskInputSchema,
} from "~/core/schema";
import { route } from "../api/route";
import {
  connect as todoConnect,
  deleteTask as todoDeleteTask,
  disconnect as todoDisconnect,
  done as todoDone,
  hideCourse as todoHideCourse,
  importFile as todoImportFile,
  list as todoList,
  refresh as todoRefresh,
  saveTask as todoSaveTask,
} from "./service";

export const TODO_ROUTES = {
  "todo/connect": route({
    input: TodoConnectInputSchema,
    perIpPerHour: 30,
    perUserPerHour: 10,
    auth: "user",
    handle: (env, input, ctx) => todoConnect(env, input, ctx),
  }),
  "todo/disconnect": route({
    input: TodoDisconnectInputSchema,
    perUserPerHour: 30,
    auth: "user",
    handle: (env, _input, ctx) => todoDisconnect(env, ctx),
  }),
  "todo/list": route({
    input: TodoListInputSchema,
    perUserPerHour: 600,
    auth: "user",
    handle: (env, input, ctx) => todoList(env, input, ctx),
  }),
  "todo/done": route({
    input: TodoDoneInputSchema,
    perUserPerHour: 1_200,
    auth: "user",
    handle: (env, input, ctx) => todoDone(env, input, ctx),
  }),
  "todo/refresh": route({
    input: TodoRefreshInputSchema,
    perUserPerHour: 30,
    auth: "user",
    handle: (env, _input, ctx) => todoRefresh(env, ctx),
  }),
  "todo/import-file": route({
    input: TodoImportFileInputSchema,
    perUserPerHour: 20,
    maxBytes: TODO_IMPORT_MAX_BYTES,
    auth: "user",
    handle: (env, input, ctx) => todoImportFile(env, input, ctx),
  }),
  "todo/hide-course": route({
    input: TodoHideCourseInputSchema,
    perUserPerHour: 300,
    auth: "user",
    handle: (env, input, ctx) => todoHideCourse(env, input, ctx),
  }),
  "todo/save-task": route({
    input: TodoSaveTaskInputSchema,
    perUserPerHour: 600,
    auth: "user",
    handle: (env, input, ctx) => todoSaveTask(env, input, ctx),
  }),
  "todo/delete-task": route({
    input: TodoDeleteTaskInputSchema,
    perUserPerHour: 600,
    auth: "user",
    handle: (env, input, ctx) => todoDeleteTask(env, input, ctx),
  }),
} as const;
