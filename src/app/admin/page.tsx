"use client";
import { useEffect, useState } from "react";
import { AdminGate, AdminLayout, type AdminSection } from "@/components/admin/AdminShell";
import { LivePanel } from "@/components/admin/LivePanel";
import { ProjectsPanel } from "@/components/admin/ProjectsPanel";
import { DataPanel } from "@/components/admin/DataPanel";
import { AccuracyPanel } from "@/components/admin/AccuracyPanel";
import { SettingsPanel } from "@/components/admin/SettingsPanel";

const SECTIONS: AdminSection[] = ["live", "projects", "data", "accuracy", "settings"];

export default function AdminPage() {
  const [section, setSection] = useState<AdminSection>("live");
  useEffect(() => {
    const read = () => {
      const h = location.hash.slice(1) as AdminSection;
      if (SECTIONS.includes(h)) setSection(h);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  const go = (s: AdminSection) => {
    setSection(s);
    history.replaceState(null, "", `#${s}`);
  };
  return (
    <AdminGate>
      <AdminLayout section={section} onSection={go}>
        {section === "live" && <LivePanel />}
        {section === "projects" && <ProjectsPanel />}
        {section === "data" && <DataPanel />}
        {section === "accuracy" && <AccuracyPanel />}
        {section === "settings" && <SettingsPanel />}
      </AdminLayout>
    </AdminGate>
  );
}
