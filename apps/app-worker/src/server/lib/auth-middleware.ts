import { redirect } from "@tanstack/react-router";
import { useAppSession } from "./session";

export async function requireAuth() {
  const session = await useAppSession();
  if (!session.data.userId) {
    throw redirect({ to: "/login" });
  }
  return session.data.userId;
}
