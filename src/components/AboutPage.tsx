import React from 'react';
import { ArrowLeft, ArrowUpRight, Download, Github, Radio, ShieldCheck, Wifi } from 'lucide-react';

export const ANDROID_RELEASE_URL = 'https://github.com/mosee-r/SpeedXpat/releases/latest';

interface AboutPageProps {
  isAndroidApp: boolean;
  onBack: () => void;
}

export const AboutPage: React.FC<AboutPageProps> = ({ isAndroidApp, onBack }) => (
  <main className="min-h-screen bg-app-canvas text-app-primary">
    <header className="sticky top-0 z-10 border-b border-app-divider bg-app-canvas/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:h-[68px] sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-app-secondary transition-colors hover:bg-app-raised hover:text-app-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>Back to SpeedXpat</span>
        </button>
        <span className="ml-auto text-xs font-mono text-app-muted">ABOUT</span>
      </div>
    </header>

    <div className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
      <section className="flex flex-col gap-6 border-b border-app-divider pb-8 sm:flex-row sm:items-center sm:gap-8 sm:pb-10">
        <img
          src="/speedxpat-logo.svg"
          alt="SpeedXpat globe and compass"
          className="h-20 w-20 shrink-0 object-contain sm:h-24 sm:w-24"
        />
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-app-accent-text">
            Network diagnostics & capability assessment
          </p>
          <h1 className="mt-2 text-3xl font-bold text-app-primary">About SpeedXpat</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-app-secondary">
            Measure connection performance and see how it may support gaming, streaming, video calls, browsing, and remote work.
          </p>
        </div>
      </section>

      <div className="grid gap-8 border-b border-app-divider py-8 sm:grid-cols-2 sm:gap-12 sm:py-10">
        <section aria-labelledby="about-measurements">
          <div className="flex items-center gap-2 text-app-accent-text">
            <Radio className="h-4 w-4" aria-hidden="true" />
            <h2 id="about-measurements" className="text-sm font-semibold text-app-primary">What it measures</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-app-secondary">
            SpeedXpat measures download and upload throughput, HTTPS round-trip latency, jitter, DNS timing, and latency under load. Activity ratings are estimates based on those measurements, not guarantees for a specific service.
          </p>
        </section>

        <section aria-labelledby="about-platforms">
          <div className="flex items-center gap-2 text-app-accent-text">
            <Wifi className="h-4 w-4" aria-hidden="true" />
            <h2 id="about-platforms" className="text-sm font-semibold text-app-primary">Web and Android</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-app-secondary">
            Browser tests use HTTP and HTTPS requests; browsers cannot send raw ICMP or scan nearby Wi-Fi. The Android app adds native ICMP ping and nearby Wi-Fi diagnostics when the device and its permissions allow them.
          </p>
        </section>
      </div>

      <section className="grid gap-8 border-b border-app-divider py-8 sm:grid-cols-2 sm:gap-12 sm:py-10">
        <div>
          <div className="flex items-center gap-2 text-app-success">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-app-primary">Privacy</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-app-secondary">
            Assessment history is stored on this device. Network tests and optional IP or provider lookups contact their respective external services; SpeedXpat does not need GPS location to run its tests.
          </p>
        </div>

        <div>
          <div className="flex items-center gap-2 text-app-accent-text">
            <Github className="h-4 w-4" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-app-primary">Project</h2>
          </div>
          <p className="mt-3 text-sm leading-6 text-app-secondary">
            Developed by <a className="font-semibold text-app-accent-text underline decoration-app-accent/40 underline-offset-4 hover:text-app-primary" href="https://github.com/mosee-r" target="_blank" rel="noopener noreferrer">mosee-r</a>.
          </p>
          <a
            className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-app-accent-text transition-colors hover:text-app-primary"
            href="https://github.com/mosee-r/SpeedXpat"
            target="_blank"
            rel="noopener noreferrer"
          >
            View source on GitHub
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </section>

      {!isAndroidApp && (
        <section className="flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:py-10" aria-labelledby="about-android-download">
          <div>
            <h2 id="about-android-download" className="text-base font-semibold text-app-primary">Take SpeedXpat on Android</h2>
            <p className="mt-1 text-sm leading-6 text-app-secondary">Get the latest signed Android release from the official project page.</p>
          </div>
          <a
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-app-accent px-4 text-sm font-semibold text-white transition-colors hover:bg-app-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent"
            href={ANDROID_RELEASE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Get Android app
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </section>
      )}
    </div>
  </main>
);