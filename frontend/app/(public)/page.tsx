import { Building2, FileSearch, Radar, ShieldCheck } from "lucide-react";
import { ResearchLauncher } from "@/components/research/ResearchLauncher";

export const metadata = {
  title: "Vantage — AI B2B Growth Intelligence",
  description:
    "Research any company, surface buying signals, and turn public evidence into a sales-ready brief.",
};

const CAPABILITIES = [
  {
    icon: FileSearch,
    title: "Research companies",
    body: "Pull a profile together from public sources, with every claim traceable to the page it came from.",
  },
  {
    icon: Radar,
    title: "Detect buying signals",
    body: "Funding, hiring pushes, launches and leadership changes — dated and cited, not guessed.",
  },
  {
    icon: Building2,
    title: "Score ICP fit",
    body: "Deterministic rules blended with the model's read, so the methodology stays stable across models.",
  },
  {
    icon: ShieldCheck,
    title: "Show the evidence",
    body: "Claims nothing backs up are marked as inferences and scored lower. No invented specifics.",
  },
];

export default function LandingPage() {
  return (
    <div className="max-w-4xl mx-auto px-5 py-14 md:py-20">
      <div className="text-center">
        <h1 className="text-3xl md:text-5xl font-semibold text-hi tracking-tight leading-tight">
          Know which accounts
          <br />
          deserve your attention.
        </h1>
        <p className="mt-4 text-base md:text-lg text-muted max-w-xl mx-auto">
          Vantage researches a company, finds what changed recently, judges the
          fit, and drafts the next step — showing its sources for every claim.
        </p>
      </div>

      <div className="mt-10">
        <ResearchLauncher autoFocus />
      </div>

      <div className="mt-16 grid gap-4 sm:grid-cols-2">
        {CAPABILITIES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex gap-3">
            <span className="w-8 h-8 rounded-lg bg-accent-soft flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-accent" />
            </span>
            <div>
              <p className="text-sm font-medium text-hi">{title}</p>
              <p className="mt-0.5 text-sm text-muted leading-relaxed">{body}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-14 text-center text-xs text-faint max-w-xl mx-auto leading-relaxed">
        Research uses publicly available information and a locally hosted
        language model. Results are an automated analysis, not a statement of
        fact about any company.
      </p>
    </div>
  );
}
