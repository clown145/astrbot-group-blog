import type { AuthSessionView } from "./auth-store";
import type { BlogRecord } from "./blog-store";

export function canViewBlog(
  blog: Pick<BlogRecord, "id" | "visibility">,
  authSession: AuthSessionView | null,
): boolean {
  if (blog.visibility === "public") {
    return true;
  }

  if (!authSession) {
    return false;
  }

  return authSession.memberships.some(
    (membership) => membership.blog_id === blog.id,
  );
}
