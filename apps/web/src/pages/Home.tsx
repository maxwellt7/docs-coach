/*
Design philosophy for this file: Swiss editorial / enterprise command-center.
The UI should feel precise, calm, evidence-led, and rubric-driven. Use asymmetric
composition, sober ink-and-paper contrast, amber editorial accents, and margin-note
motifs. Every module should reinforce the idea of a senior business documentation
coach reviewing Google Docs with structured, prioritized guidance.
*/
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Blocks,
  BrainCircuit,
  CheckCircle2,
  Chrome,
  FileText,
  GitBranch,
  Layers3,
  NotepadText,
  Radar,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const heroImage = "/assets/docs-coach-editorial-hero.png";
const notesImage = "/assets/docs-coach-margin-notes.png";
const routingImage = "/assets/docs-coach-knowledge-routing.png";

const phases = [
  {
    label: "01",
    title: "Duplicate and preserve the backend",
    body: "Keep the FastAPI, Pinecone registry, router, RRF retrieval, verifier, and synthesis pipeline. Replace the chat surface, not the knowledge engine.",
  },
  {
    label: "02",
    title: "Add a structured document-review endpoint",
    body: "Accept document snapshots, classify document type, select review lenses, route knowledge bases, and return scored suggestion cards instead of a free-form chat answer.",
  },
  {
    label: "03",
    title: "Ship a local Chrome extension MVP",
    body: "Use a Manifest V3 content script and side panel for Google Docs. Start with title, selection, visible text, and manual review actions to avoid fragile realtime issues.",
  },
  {
    label: "04",
    title: "Add reliable whole-document ingestion",
    body: "Layer in Google Docs API OAuth for full document text, section traversal, hashes, and debounced changed-section reviews once the core review loop is proven.",
  },
];

const lenses = [
  "Clarity and reader intent",
  "Owner accountability",
  "Handoffs and escalation",
  "Success criteria",
  "Operational risk",
  "Contract/business-risk flags",
];

const architecture = [
  {
    icon: Chrome,
    title: "Extension layer",
    text: "Detects Google Docs, captures context, renders side-panel reviews, and manages low-noise polling.",
  },
  {
    icon: BrainCircuit,
    title: "Review API",
    text: "Normalizes document snapshots, classifies type, selects review mode, and returns structured recommendations.",
  },
  {
    icon: Layers3,
    title: "Knowledge routing",
    text: "Reuses your registry, multi-index router, Pinecone retrieval, RRF merge, reranker, and verifier.",
  },
];

const suggestions = [
  {
    severity: "High",
    title: "Missing accountable owner",
    body: "The SOP describes a handoff, but does not name the role responsible for validation or escalation.",
  },
  {
    severity: "High",
    title: "Contract ambiguity",
    body: "The obligation is stated broadly. Add threshold, timeline, and remedy language before publishing.",
  },
  {
    severity: "Medium",
    title: "Weak readiness criteria",
    body: "The document explains the process but does not define how someone knows the process worked.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#f5f1e8] text-[#1f241d]">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_15%_15%,rgba(164,105,45,0.16),transparent_28%),radial-gradient(circle_at_85%_5%,rgba(31,36,29,0.10),transparent_24%),linear-gradient(90deg,rgba(31,36,29,0.055)_1px,transparent_1px),linear-gradient(rgba(31,36,29,0.045)_1px,transparent_1px)] bg-[length:auto,auto,54px_54px,54px_54px]" />

      <header className="relative z-10 border-b border-[#1f241d]/15 bg-[#f5f1e8]/82 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center border border-[#1f241d] bg-[#1f241d] text-[#f5f1e8] shadow-[5px_5px_0_rgba(31,36,29,0.18)]">
              <NotepadText className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-xl font-semibold tracking-tight">Docs Coach</p>
              <p className="text-xs uppercase tracking-[0.24em] text-[#6e6a5f]">Chrome extension scope</p>
            </div>
          </div>
          <div className="hidden items-center gap-2 text-sm text-[#5d5a50] md:flex">
            <BadgeCheck className="h-4 w-4 text-[#8b5d27]" />
            Reuses maxmayes-chat backend intelligence
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid max-w-7xl gap-10 px-5 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-20">
          <div className="flex flex-col justify-between gap-10">
            <div>
              <div className="mb-7 inline-flex items-center gap-2 border border-[#1f241d]/20 bg-white/55 px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-[#6e4b22] shadow-[4px_4px_0_rgba(31,36,29,0.08)]">
                <Sparkles className="h-3.5 w-3.5" />
                Reforge-style document coaching
              </div>
              <h1 className="max-w-4xl font-display text-5xl font-semibold leading-[0.94] tracking-[-0.055em] text-[#1f241d] md:text-7xl">
                Turn your chat archive into a real-time business documentation coach.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-[#575349]">
                The right move is to preserve the current knowledge-routing backend and rebuild the input surface as a Chrome extension that reviews SOPs, contracts, policies, and operating docs directly inside Google Docs.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["Reuse", "FastAPI + Pinecone router"],
                ["Replace", "Chat UI with review rail"],
                ["Add", "Google Docs capture layer"],
              ].map(([label, body]) => (
                <div key={label} className="border border-[#1f241d]/16 bg-[#fffaf0]/72 p-4 shadow-[6px_6px_0_rgba(31,36,29,0.08)]">
                  <p className="text-xs uppercase tracking-[0.24em] text-[#8b5d27]">{label}</p>
                  <p className="mt-2 text-sm font-semibold leading-5">{body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative min-h-[560px]">
            <div className="absolute right-0 top-0 h-[76%] w-[88%] overflow-hidden border border-[#1f241d]/20 bg-[#1f241d] shadow-[18px_18px_0_rgba(31,36,29,0.16)]">
              <img src={heroImage} alt="Abstract editorial document intelligence visualization" className="h-full w-full object-cover opacity-92" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#1f241d]/35 via-transparent to-transparent" />
            </div>
            <div className="absolute bottom-0 left-0 w-[76%] border border-[#1f241d]/20 bg-[#fffaf0] p-5 shadow-[14px_14px_0_rgba(31,36,29,0.18)]">
              <div className="mb-4 flex items-center justify-between border-b border-[#1f241d]/15 pb-3">
                <p className="font-display text-2xl font-semibold tracking-tight">Live review rail</p>
                <span className="border border-[#8b5d27]/30 bg-[#f2dfbd] px-2 py-1 text-xs font-semibold text-[#6e4b22]">Score 7.2</span>
              </div>
              <div className="space-y-3">
                {suggestions.map((item) => (
                  <div key={item.title} className="grid grid-cols-[72px_1fr] gap-3 border-l-2 border-[#8b5d27] bg-[#f5f1e8]/72 p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8b5d27]">{item.severity}</p>
                    <div>
                      <p className="text-sm font-bold">{item.title}</p>
                      <p className="mt-1 text-xs leading-5 text-[#5d5a50]">{item.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-14 lg:px-8">
          <div className="grid gap-4 md:grid-cols-3">
            {architecture.map((item) => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="group border border-[#1f241d]/15 bg-[#fffaf0]/74 p-6 transition duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-[10px_10px_0_rgba(31,36,29,0.11)]">
                  <Icon className="h-7 w-7 text-[#8b5d27]" />
                  <h2 className="mt-8 font-display text-2xl font-semibold tracking-tight">{item.title}</h2>
                  <p className="mt-3 text-sm leading-6 text-[#5d5a50]">{item.text}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="border-y border-[#1f241d]/15 bg-[#222820] py-16 text-[#f5f1e8]">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#c79a5a]">Sequencing logic</p>
              <h2 className="mt-4 font-display text-4xl font-semibold leading-tight tracking-[-0.04em] md:text-5xl">
                Review the document type first, then route the knowledge.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-7 text-[#d9d1c1]">
                The extension should not ask the backend a generic question. It should send a structured review request: document type, surface, selected range, visible section, review mode, and changed-section hash.
              </p>
              <div className="mt-8 overflow-hidden border border-[#f5f1e8]/15 bg-[#111510]">
                <img src={routingImage} alt="Knowledge routing diagram" className="h-56 w-full object-cover opacity-90" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {lenses.map((lens, index) => (
                <div key={lens} className="border border-[#f5f1e8]/14 bg-[#f5f1e8]/7 p-4">
                  <div className="mb-7 flex items-center justify-between">
                    <span className="text-xs uppercase tracking-[0.22em] text-[#c79a5a]">Lens {index + 1}</span>
                    <Radar className="h-4 w-4 text-[#c79a5a]" />
                  </div>
                  <p className="font-semibold leading-6">{lens}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl gap-10 px-5 py-16 lg:grid-cols-[1fr_0.95fr] lg:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#8b5d27]">Low-troubleshooting build path</p>
            <h2 className="mt-4 font-display text-4xl font-semibold tracking-[-0.04em] md:text-5xl">Start with a side-panel MVP, then make extraction more reliable.</h2>
            <div className="mt-9 space-y-4">
              {phases.map((phase) => (
                <div key={phase.label} className="grid gap-4 border-t border-[#1f241d]/15 py-5 md:grid-cols-[80px_1fr]">
                  <span className="font-display text-3xl text-[#8b5d27]">{phase.label}</span>
                  <div>
                    <h3 className="text-lg font-bold">{phase.title}</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5d5a50]">{phase.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <aside className="lg:sticky lg:top-8 lg:self-start">
            <div className="overflow-hidden border border-[#1f241d]/18 bg-[#fffaf0] shadow-[16px_16px_0_rgba(31,36,29,0.14)]">
              <img src={notesImage} alt="Margin notes interface preview" className="h-64 w-full object-cover" />
              <div className="p-6">
                <div className="mb-4 flex items-center gap-2 text-[#8b5d27]">
                  <GitBranch className="h-5 w-5" />
                  <p className="text-xs font-bold uppercase tracking-[0.24em]">Recommended split</p>
                </div>
                <div className="space-y-4 text-sm leading-6 text-[#4f4b42]">
                  <p><strong>Keep:</strong> registry, retrieval, verifier, Pinecone services, backend tests, and admin concepts.</p>
                  <p><strong>Change:</strong> prompts, schemas, output format, and review orchestration.</p>
                  <p><strong>Add:</strong> extension package, Google Docs adapter, document diffing, and structured suggestion cards.</p>
                </div>
              </div>
            </div>
          </aside>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-20 lg:px-8">
          <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <div className="border border-[#1f241d]/15 bg-[#1f241d] p-7 text-[#f5f1e8]">
              <ShieldCheck className="h-8 w-8 text-[#c79a5a]" />
              <h2 className="mt-6 font-display text-3xl font-semibold tracking-tight">Yes, this is feasible.</h2>
              <p className="mt-4 text-sm leading-7 text-[#d9d1c1]">
                The quickest path is not to rebuild the AI system. It is to feed your existing knowledge router a better input object and render the output as document-review cards.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              {[
                [AlertTriangle, "Main risk", "Google Docs DOM polling is fragile. Treat it as MVP context capture, not the long-term source of truth."],
                [FileText, "Reliable path", "Use Google Docs API extraction for full-document traversal once the side-panel review loop works."],
                [Blocks, "Best first use case", "SOPs and internal operating docs before high-stakes legal review or automatic edits."],
                [CheckCircle2, "Success metric", "Five to ten prioritized suggestions that feel like an operator reviewed the doc, not a grammar checker."],
              ].map(([Icon, title, text]) => {
                const TypedIcon = Icon as typeof AlertTriangle;
                return (
                  <div key={title as string} className="border border-[#1f241d]/15 bg-[#fffaf0]/78 p-5">
                    <TypedIcon className="h-5 w-5 text-[#8b5d27]" />
                    <h3 className="mt-5 font-bold">{title as string}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#5d5a50]">{text as string}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-[#1f241d]/15 bg-[#efe7d6] px-5 py-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 text-sm text-[#5d5a50] md:flex-row md:items-center md:justify-between">
          <p>Docs Coach Extension Scope — architecture preview and implementation path.</p>
          <p className="flex items-center gap-2 font-semibold text-[#1f241d]">Read the attached scope document <ArrowRight className="h-4 w-4" /></p>
        </div>
      </footer>
    </div>
  );
}
