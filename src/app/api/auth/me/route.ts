import { route, HttpError } from "@/server/http";
import { loadMe } from "@/server/me";

export const GET = route(async () => {
  const me = await loadMe();
  if (!me) throw new HttpError(401, "Not signed in.");
  return me;
});
