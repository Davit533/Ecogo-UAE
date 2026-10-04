import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:{default:'GoGreen UAE — Small actions. Lasting change.',template:'%s · GoGreen UAE'},description:'Find litter, organize safe cleanups, learn about our environment, and grow a greener UAE together.',manifest:'/manifest.webmanifest',icons:{icon:'/icon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a>{children}</body></html>;}
