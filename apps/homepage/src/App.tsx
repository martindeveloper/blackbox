"use client";
import "./i18n/index";
import { Hero } from "./components/Hero";
import { Pitch } from "./components/Pitch";
import { Features } from "./components/Features";
import { Toolchain } from "./components/Toolchain";
import { Architecture } from "./components/Architecture";
import { Platforms } from "./components/Platforms";
import { EditorShowcase } from "./components/EditorShowcase";
import { ScenarioSnippet } from "./components/ScenarioSnippet";
import { Footer } from "./components/Footer";

export function App() {
  return (
    <>
      <main>
        <Hero />
        <Pitch />
        <Features />
        <Toolchain />
        <Architecture />
        <Platforms />
        <EditorShowcase />
        <ScenarioSnippet />
      </main>
      <Footer />
    </>
  );
}
