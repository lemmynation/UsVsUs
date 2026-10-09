import type { MetadataRoute } from "next";

/**
 * Rooms and admin pages are private: keep crawlers out. Invite pages (/join/) stay
 * crawlable so Messenger/Facebook can build link previews; they carry noindex instead.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/room/", "/admin/", "/api/", "/dev/"] },
  };
}
