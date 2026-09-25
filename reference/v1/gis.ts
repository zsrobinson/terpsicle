export async function getToken() {
  const res = await fetch("https://maps.umd.edu/api/PortalToken/tokens.js", {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:144.0) Gecko/20100101 Firefox/144.0",
    },
  });
  const text = await res.text();
  const token = text.split(`"token": "`).at(1)!.split(`",`).at(0)!;
  return token;
}

export async function getFeatures(location: string, token: string) {
  const res = await fetch(
    `https://gis.umd.edu/arcgis/rest/services/Navigation/DynamicRouting/MapServer/13/query?f=json&where=WEBMAP = 'Yes' AND NAV_USE = 'Yes' AND Entr_Type <> 'Emergency Exit' AND LOCATIONID = '${location}'&returnGeometry=true&spatialRel=esriSpatialRelIntersects&outFields=NAME,Accessible,Card_Acces,X,Y,BLDGNUM,LOCATIONID&outSR=102100&token=${token}`
  );
  const json = await res.json();

  // adds some extra data that's needed for the getClosestFacility endpoint
  return {
    type: "features",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    features: json.features.map((feat: any) => ({
      geometry: {
        spatialReference: { wkid: 102100, latestWkid: 3857 },
        ...feat.geometry,
      },
      attributes: {
        Name: null,
        ...feat.attributes,
      },
    })),
    doNotLocateOnRestrictedElements: true,
  };
}

const getFormData = (object: Record<string, string>) =>
  Object.keys(object).reduce((formData, key) => {
    formData.append(key, object[key]);
    return formData;
  }, new FormData());

function getFormData2(object: Record<string, string>) {
  const result = getFormData(object);
  console.log(result);
  return result;
}

export async function getDirections(
  locationFrom: string,
  locationTo: string,
  accessible: boolean
) {
  const token = await getToken();
  const incidents = await getFeatures(locationFrom, token);
  const facilities = await getFeatures(locationTo, token);

  const res = await fetch(
    `https://gis.umd.edu/arcgis/rest/services/Navigation/DynamicRouting${
      accessible ? "Accessible" : ""
    }/NAServer/Closest%20Facility/solveClosestFacility`,
    {
      method: "POST",
      body: getFormData2({
        f: "json",
        returnDirections: "false",
        returnFacilities: "true",
        returnIncidents: "true",
        returnBarriers: "false",
        returnPolygonBarriers: "false",
        returnPolylineBarriers: "false",
        returnCFRoutes: "true",
        useHierarchy: "false",
        outSR: "102100",
        travelMode: "null",
        incidents: JSON.stringify(incidents),
        facilities: JSON.stringify(facilities),
        polygonBarriers:
          '{"type":"features","features":[{"geometry":{"rings":[[[-8566006.92203236,4719849.920474799],[-8566180.099674555,4719860.669431901],[-8566188.459974522,4720094.757831004],[-8566004.533375226,4720100.729473839],[-8566006.92203236,4720100.729473839],[-8566006.92203236,4719849.920474799]]],"spatialReference":{"wkid":102100,"latestWkid":3857}}}]}',
        token: token,
      }),
    }
  );

  const json = await res.json();
  console.log(json);
  const routes: number[] = json.routes.features.map(
    (feat: { attributes: { Total_Length: number } }) =>
      feat.attributes.Total_Length
  );
  const minRoute = Math.min(...routes);
  return minRoute;
}
