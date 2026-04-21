import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from "./auth";

export async function isAdminAuthorized(): Promise<boolean> {
  const cookieStore = await cookies();
  return verifyAdminCookieValue(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
}
