import { redirect } from "next/navigation";

export default function Home() {
  // P0: go straight to the console. P2 adds auth gating + a login page.
  redirect("/dashboard");
}
