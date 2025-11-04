import { professorSchema } from "./types-pt";

const API = "https://planetterp.com/api/v1";

/** @see https://planetterp.com/api/v1/course */
export async function getProfessorFromPT({ name }: { name: string }) {
  const res = await fetch(`${API}/professor?name=${name}`);
  const json: unknown = await res.json();
  const parsed = professorSchema.parse(json);
  return parsed;
}
