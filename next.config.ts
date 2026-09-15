import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // GitHub 아바타(헤더). avatar_url에 ?v=4 쿼리가 붙으므로 search는 생략(모든 쿼리 허용)
  images: {
    remotePatterns: [{ protocol: "https", hostname: "avatars.githubusercontent.com", pathname: "/u/**" }],
  },
};

export default nextConfig;
