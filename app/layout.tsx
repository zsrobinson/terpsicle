import type { Metadata } from "next";
import { ReactNode } from "react";
import "./globals.css";
import { Navbar } from "~/components/navbar";

// const inter = Inter({
//   variable: "--font-inter",
//   subsets: ["latin"],
// });

export const metadata: Metadata = {
  title: "Terpsicle",
  // description: "Generated by create next app",
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased m-8">
        <Navbar />
        <hr className="my-4" />
        {children}
      </body>
    </html>
  );
}
