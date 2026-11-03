import { connection, NextResponse } from "next/server";

import { getServerSession } from "@/lib/auth-server";
import { getUserRoles } from "@/lib/appwrite-roles";
import { getEnvConfig } from "@/lib/appwrite-core";

/**
 * Identity and global roles for the authenticated caller.
 *
 * Also the only place the mobile app can learn `isAdmin` / `isModerator`,
 * which it uses to decide whether to show the Admin tab. Returning 404 in
 * production left `currentUser.roles` permanently undefined there, so global
 * admins and moderators never got the Admin tab on a real instance.
 *
 * Everything returned is scoped to the caller (their own id, name, email and
 * their own roles) and is 401 without a valid session, so it is safe to serve
 * in production. The `.env.local` hint is a development diagnostic only.
 */
export async function GET() {
    await connection();

    const user = await getServerSession();

    if (!user) {
        const env = getEnvConfig();
        const cookieName = `a_session_${env.project}`;
        const res = NextResponse.json(
            { error: "Not authenticated" },
            { status: 401 },
        );
        res.cookies.delete(cookieName);
        return res;
    }

    const roles = await getUserRoles(user.$id);

    return NextResponse.json(
        {
            userId: user.$id,
            name: user.name,
            email: user.email,
            roles: {
                isAdmin: roles.isAdmin,
                isModerator: roles.isModerator,
            },
            ...(process.env.NODE_ENV === "production"
                ? {}
                : {
                      message:
                          "Copy your userId above and add it to .env.local as APPWRITE_ADMIN_USER_IDS",
                  }),
        },
        // Identity and roles change when a session is revoked or a team
        // membership changes; never let a shared cache serve a stale answer.
        { headers: { "Cache-Control": "no-store" } },
    );
}
