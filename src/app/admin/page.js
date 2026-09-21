import { isAuthed } from "@/lib/auth";
import { listAll } from "@/lib/projects";
import {
  getLanding,
  getInfo,
  getImmersive,
  getTabStates,
} from "@/lib/settings";
import LoginForm from "@/components/admin/LoginForm";
import AdminDashboard from "@/components/admin/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAuthed())) {
    return (
      <div
        className="min-h-screen bg-black text-white flex items-center justify-center p-6"
        style={{ colorScheme: "dark" }}
      >
        <LoginForm />
      </div>
    );
  }
  const [projects, landing, info, immersive, tabStates] = await Promise.all([
    listAll(),
    getLanding(),
    getInfo(),
    getImmersive(),
    getTabStates(),
  ]);
  return (
    <div
      className="min-h-screen bg-black text-white p-6"
      style={{ colorScheme: "dark" }}
    >
      <AdminDashboard
        initialProjects={projects}
        initialLanding={landing}
        initialInfo={info}
        initialImmersive={immersive}
        initialTabStates={tabStates}
      />
    </div>
  );
}
