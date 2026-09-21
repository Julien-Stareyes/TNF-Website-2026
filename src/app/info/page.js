import { getInfo, getTabStates } from "@/lib/settings";
import InfoPage from "@/components/InfoPage";
import ComingSoon from "@/components/ComingSoon";
import ParkedNotice from "@/components/ParkedNotice";
import { isAuthed } from "@/lib/auth";

export const revalidate = 3600;

export default async function Info() {
  // Parked from the admin. The public gets a holding screen; a
  // signed-in operator still sees the real section, so it stays
  // editable in the preview while it's offline. Reading the session
  // here also opts the route out of static caching, so the operator's
  // view can never be served to a visitor.
  const parked = (await getTabStates())["info"] !== "live";
  if (parked && !(await isAuthed())) return <ComingSoon title="Info" />;

  const info = await getInfo();
  return (
    <>
      <InfoPage info={info} />
      {parked && <ParkedNotice />}
    </>
  );
}
