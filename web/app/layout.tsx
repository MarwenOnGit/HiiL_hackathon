import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Insaf — commercial justice for MSMEs",
  description: "One dashboard: harden your contract, invite the other party, settle disputes."
};

// Pre-paint: apply the stored theme before first render to avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem('insaf-theme');if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}