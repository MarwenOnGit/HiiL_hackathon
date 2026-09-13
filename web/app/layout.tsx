import type { Metadata } from "next";
import { LocaleProvider } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "Insaf — commercial justice for MSMEs / عدالة تجارية للمؤسسات الصغرى والمتوسطة",
  description: "One dashboard: harden your contract, invite the other party, settle disputes before court."
};

// Pre-paint: apply the stored theme AND language before first render to avoid
// a flash of the wrong direction / theme.
const prePaintScript = `(function(){try{
  var t=localStorage.getItem('insaf-theme');if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}
  document.documentElement.setAttribute('data-theme',t);
  var l='fr';
  var c=document.cookie.split(';').map(function(s){return s.trim()}).filter(function(s){return s.indexOf('insaf_lang=')===0})[0];
  if(c){var v=decodeURIComponent(c.slice('insaf_lang='.length));if(v==='ar'||v==='fr')l=v;}
  else{var s=localStorage.getItem('insaf-lang');if(s==='ar'||s==='fr')l=s;}
  document.documentElement.setAttribute('lang',l);
  document.documentElement.setAttribute('dir',l==='ar'?'rtl':'ltr');
}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <script dangerouslySetInnerHTML={{ __html: prePaintScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <LocaleProvider>{children}</LocaleProvider>
      </body>
    </html>
  );
}