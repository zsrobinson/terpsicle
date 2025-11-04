import { getDirections } from "~/lib/gis";

export default async function Page() {
  const locations = ["419", "026"];
  const accessible = true;
  const route = await getDirections(locations[0], locations[1], accessible);

  return (
    <div className="p-8">
      <h1>test gis page</h1>
      <p>from: {locations[0]}</p>
      <p>to: {locations[1]}</p>
      <p>accessible: {accessible ? "true" : "false"}</p>
      <hr className="my-4" />
      <p>distance: {route} feet</p>
      <p>time: {route / 287} mins</p>
    </div>
  );
}
