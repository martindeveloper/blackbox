import type { MetadataRoute } from "next";
import { listSitemapEntries } from "@/lib/siteRoutes";

export default function sitemap(): MetadataRoute.Sitemap {
  return listSitemapEntries().map(({ url, lastModified }) => ({
    url,
    lastModified,
  }));
}
