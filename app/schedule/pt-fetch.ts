import { professorSchema } from "./pt-types";

const API = "https://planetterp.com/api/v1";

/** @see https://planetterp.com/api/v1/course */
export async function fetchProfessor({ name }: { name: string }) {
  const res = await fetch(`${API}/professor?name=${name}`);
  const json: unknown = await res.json();
  const parsed = professorSchema.parse(json);
  return parsed;
}
