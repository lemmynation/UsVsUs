import { Wordmark } from "@/components/brand/wordmark";
import { PageShell } from "@/components/layout/page-shell";
import { JoinCodeForm } from "@/components/room/join-code-form";

export const metadata = { title: "Join a game — Us vs. Us" };

export default function JoinPage() {
  return (
    <PageShell>
      <Wordmark />
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-4xl font-extrabold">Join a room</h1>
        <p className="text-muted-foreground text-lg">Enter the 6-character code from your host.</p>
      </div>
      <JoinCodeForm />
    </PageShell>
  );
}
