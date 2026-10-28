import { SharedJob } from "../../shared-job";
export const metadata = { title: "Job progress | VAPS", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <SharedJob id={id} />; }
