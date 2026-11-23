import { ProjectBuilder } from "@/components/builder/ProjectBuilder";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectBuilder id={id} />;
}
