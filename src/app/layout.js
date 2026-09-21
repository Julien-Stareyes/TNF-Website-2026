import "./globals.css";
import { getTabStates } from "@/lib/settings";
import { TabStatesProvider } from "@/lib/tab-states";
import SiteLoader from "@/components/SiteLoader";
import CustomCursor from "@/components/CustomCursor";

export const metadata = {
  title: "The New Face",
  description: "Autonomous research-driven creative practice.",
};

export default async function RootLayout({ children }) {
  // Read once here so the header can drop links for parked sections
  // without every page having to pass the state down itself.
  const tabs = await getTabStates();

  return (
    <html lang="en">
      {/* CustomCursor sits directly under <body>, with nothing transformed
          in between -- its mix-blend-mode needs an unbroken stacking
          context down to the actual page content to blend against it. */}
      <body className="antialiased bg-white">
        <CustomCursor />
        <SiteLoader />
        <TabStatesProvider value={tabs}>{children}</TabStatesProvider>
      </body>
    </html>
  );
}
