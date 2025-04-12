import type { Metadata } from "next";
import { ReactNode } from "react";
import "./globals.css";
import { config } from '@fortawesome/fontawesome-svg-core';
import '@fortawesome/fontawesome-svg-core/styles.css';
import Header from '../components/Header';
import { Navbar } from '../components/navbar';

config.autoAddCss = false;

export const metadata: Metadata = {
  title: "Terpsicle",
  // description: "Generated by create next app",
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        <Header />
        <main className="pt-12 px-8">
          <Navbar />
          <hr className="my-4" />
          {children}
        </main>
      </body>
    </html>
  );
}
